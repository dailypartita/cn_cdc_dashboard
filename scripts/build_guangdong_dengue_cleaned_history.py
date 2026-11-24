#!/usr/bin/env python3
"""Build a cleaned Guangdong monthly dengue history CSV.

Priority for `cases` (no interpolation, no invented zeros beyond source-coded 0):
1. Official provincial monthly bulletin (`data/processed/guangdong_dengue_monthly.csv`)
   when cases are present.
2. Zenodo 2016–2024 for months with no official value and month >= 2022-01
   (phsciencedata has no usable rows after 2021).
3. phsciencedata Guangdong extract for earlier months (including explicit 0 when
   other provinces reported but Guangdong did not).

When official is missing but both phsci and Zenodo exist (2016–2021), prefer
phsciencedata because 2020 annual total matches the project's official annual
reconciliation (58) while Zenodo sums to 59.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "data" / "external"
PROCESSED = ROOT / "data" / "processed"
OUT = PROCESSED / "guangdong_dengue_monthly_cleaned_2004_present.csv"


def month_range(start: str, end: str) -> list[str]:
    idx = pd.period_range(start=start, end=end, freq="M")
    return [p.strftime("%Y-%m") for p in idx]


def main() -> None:
    phsci = pd.read_csv(EXT / "phsciencedata_guangdong_dengue_monthly_2004_2025.csv")
    zenodo = pd.read_csv(EXT / "zenodo_guangdong_dengue_monthly_2016_2024.csv")
    official = pd.read_csv(PROCESSED / "guangdong_dengue_monthly.csv")

    phsci["cases_phsci"] = pd.to_numeric(phsci["cases"], errors="coerce")
    zenodo = zenodo.rename(columns={"cases_zenodo": "cases_zenodo"})
    zenodo["cases_zenodo"] = pd.to_numeric(zenodo["cases_zenodo"], errors="coerce")
    official["cases_official"] = pd.to_numeric(official["cases"], errors="coerce")

    phsci_q = phsci.set_index("month")["quality_status"].to_dict()
    off_q = official.set_index("month")["quality_status"].to_dict()
    off_url = official.set_index("month")["source_url"].to_dict() if "source_url" in official.columns else {}
    off_notes = official.set_index("month")["notes"].to_dict() if "notes" in official.columns else {}

    p = phsci[["month", "cases_phsci"]].drop_duplicates("month")
    z = zenodo[["month", "cases_zenodo"]].drop_duplicates("month")
    o = official[["month", "cases_official"]].drop_duplicates("month")

    end = max(
        [
            x
            for x in [
                p["month"].max() if len(p) else None,
                z["month"].max() if len(z) else None,
                o.dropna(subset=["cases_official"])["month"].max() if o["cases_official"].notna().any() else None,
            ]
            if x
        ]
    )
    months = month_range("2004-01", end)
    base = pd.DataFrame({"month": months, "location": "GD"})
    df = (
        base.merge(p, on="month", how="left")
        .merge(z, on="month", how="left")
        .merge(o, on="month", how="left")
    )

    rows = []
    for _, r in df.iterrows():
        month = r["month"]
        c_off = r["cases_official"]
        c_z = r["cases_zenodo"]
        c_p = r["cases_phsci"]
        notes = []
        cases = None
        source_primary = ""
        quality = "missing"

        if pd.notna(c_off):
            cases = float(c_off)
            source_primary = "official_bulletin"
            quality = off_q.get(month, "verified")
            if off_notes.get(month) and not (isinstance(off_notes.get(month), float) and pd.isna(off_notes.get(month))):
                notes.append(str(off_notes[month]))
            if pd.notna(c_z) and abs(float(c_z) - cases) >= 1e-6:
                notes.append(f"zenodo={int(c_z)}")
            if pd.notna(c_p) and abs(float(c_p) - cases) >= 1e-6:
                notes.append(f"phsci={int(c_p)}")
        elif month >= "2022-01" and pd.notna(c_z):
            cases = float(c_z)
            source_primary = "zenodo_2016_2024"
            quality = "external_open"
        elif pd.notna(c_p):
            cases = float(c_p)
            source_primary = "phsciencedata"
            q = phsci_q.get(month, "")
            if q == "verified":
                quality = "verified"
            elif q == "no_gd_impute0":
                quality = "imputed_zero_no_gd_row"
                notes.append("全国有表但无广东省行，记为 0")
            else:
                quality = q or "phsci"
            if pd.notna(c_z) and abs(float(c_z) - cases) >= 1e-6:
                notes.append(f"zenodo_diff={int(c_z)}")
                notes.append("重叠月优先 phsciencedata（与官方年合计更一致）")
        elif pd.notna(c_z):
            cases = float(c_z)
            source_primary = "zenodo_2016_2024"
            quality = "external_open"
        else:
            quality = "missing"
            notes.append("无可用来源，未补 0、未插值")

        rows.append(
            {
                "month": month,
                "location": "GD",
                "cases": "" if cases is None else int(round(cases)),
                "source_primary": source_primary,
                "quality_status": quality,
                "cases_phsci": "" if pd.isna(c_p) else int(round(float(c_p))),
                "cases_zenodo": "" if pd.isna(c_z) else int(round(float(c_z))),
                "cases_official": "" if pd.isna(c_off) else int(round(float(c_off))),
                "source_url": off_url.get(month, "") if source_primary == "official_bulletin" else (
                    "https://doi.org/10.5281/zenodo.18391003"
                    if source_primary == "zenodo_2016_2024"
                    else (
                        "https://www.phsciencedata.cn/Share/ky_sjml.jsp"
                        if source_primary == "phsciencedata"
                        else ""
                    )
                ),
                "notes": "；".join(notes),
            }
        )

    out = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False, encoding="utf-8-sig")

    valued = (out["cases"] != "").sum()
    missing = (out["cases"] == "").sum()
    by_src = out.loc[out["cases"] != "", "source_primary"].value_counts().to_dict()
    print(f"wrote {OUT}")
    print(
        {
            "rows": len(out),
            "with_cases": int(valued),
            "missing": int(missing),
            "range": f"{out['month'].iloc[0]}->{out['month'].iloc[-1]}",
            "by_source": by_src,
        }
    )


if __name__ == "__main__":
    main()
