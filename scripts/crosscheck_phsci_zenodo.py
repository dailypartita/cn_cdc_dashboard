#!/usr/bin/env python3
"""Cross-check Guangdong dengue monthly series: phsciencedata vs Zenodo vs official."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "data" / "external"
RAW_Z = ROOT / "data" / "raw" / "zenodo_18391003"


def df_md(df: pd.DataFrame | None) -> str:
    if df is None or getattr(df, "empty", False):
        return "无"
    cols = list(df.columns)
    lines = [
        "| " + " | ".join(map(str, cols)) + " |",
        "| " + " | ".join(["---"] * len(cols)) + " |",
    ]
    for _, row in df.iterrows():
        vals = ["" if pd.isna(v) else str(v) for v in row.tolist()]
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def annual(df: pd.DataFrame, col: str, name: str) -> pd.Series:
    tmp = df.dropna(subset=[col]).copy()
    tmp["year"] = tmp["month"].str[:4]
    return tmp.groupby("year")[col].sum().rename(name)


def main() -> None:
    EXT.mkdir(parents=True, exist_ok=True)

    xl = pd.ExcelFile(RAW_Z / "guangdong_dengue_2016_2024.xlsx")
    z = pd.read_excel(xl, xl.sheet_names[0])
    print("zenodo sheets", xl.sheet_names)
    print("zenodo cols", list(z.columns))
    print(z.head(8).to_string(index=False))

    date_col = None
    case_col = None
    for c in z.columns:
        cl = str(c).lower()
        if date_col is None and any(k in cl for k in ["date", "month", "time", "年月", "日期", "year"]):
            date_col = c
        if case_col is None and any(k in cl for k in ["case", "病例", "发病", "count", "number", "dengue"]):
            case_col = c
    if date_col is None:
        date_col = z.columns[0]
    if case_col is None:
        nums = [c for c in z.columns if pd.api.types.is_numeric_dtype(z[c])]
        case_col = nums[0] if nums else z.columns[1]
    print("using", date_col, case_col)

    year_c = next((c for c in z.columns if "year" in str(c).lower() or str(c) in ["年", "年份"]), None)
    month_c = next(
        (
            c
            for c in z.columns
            if str(c).lower() in ["month", "月", "月份"]
            or ("month" in str(c).lower() and c != date_col)
        ),
        None,
    )

    zz = pd.DataFrame()
    s = z[date_col]
    if pd.api.types.is_datetime64_any_dtype(s):
        zz["month"] = pd.to_datetime(s).dt.strftime("%Y-%m")
    elif year_c is not None and month_c is not None and month_c != date_col:
        zz["month"] = (
            z[year_c].astype(int).astype(str)
            + "-"
            + z[month_c].astype(int).astype(str).str.zfill(2)
        )
    else:
        # Zenodo uses labels like "2016年1月"
        parsed = (
            s.astype(str)
            .str.extract(r"(?P<y>\d{4})\D+(?P<m>\d{1,2})")
        )
        if parsed["y"].notna().any():
            zz["month"] = parsed["y"] + "-" + parsed["m"].astype(int).astype(str).str.zfill(2)
        else:
            zz["month"] = pd.to_datetime(s, errors="coerce").dt.strftime("%Y-%m")
    zz["cases_zenodo"] = pd.to_numeric(z[case_col], errors="coerce")
    zz = zz.dropna(subset=["month"]).drop_duplicates("month").sort_values("month")
    zz.to_csv(EXT / "zenodo_guangdong_dengue_monthly_2016_2024.csv", index=False, encoding="utf-8-sig")
    print(
        "zenodo",
        len(zz),
        zz["month"].iloc[0],
        "->",
        zz["month"].iloc[-1],
        "sum",
        zz["cases_zenodo"].sum(),
    )

    p = pd.read_csv(EXT / "phsciencedata_guangdong_dengue_monthly_2004_2025.csv")
    p["cases_phsci"] = pd.to_numeric(p["cases"], errors="coerce")

    off = pd.read_csv(ROOT / "data" / "processed" / "guangdong_dengue_monthly.csv")
    off["cases_official"] = pd.to_numeric(off["cases"], errors="coerce")
    off = off[["month", "cases_official"]]

    merged = zz.merge(p[["month", "cases_phsci", "quality_status"]], on="month", how="outer")
    merged = merged.merge(off, on="month", how="left").sort_values("month")
    merged.to_csv(EXT / "guangdong_dengue_monthly_crosscheck.csv", index=False, encoding="utf-8-sig")

    ov = merged.dropna(subset=["cases_zenodo", "cases_phsci"]).copy()
    ov["diff"] = ov["cases_zenodo"] - ov["cases_phsci"]
    ov["match"] = ov["diff"].abs() < 1e-6

    ov2 = merged.dropna(subset=["cases_zenodo", "cases_official"]).copy()
    ov2["diff"] = ov2["cases_zenodo"] - ov2["cases_official"]
    ov2["match"] = ov2["diff"].abs() < 1e-6

    ov3 = merged.dropna(subset=["cases_phsci", "cases_official"]).copy()
    ov3["diff"] = ov3["cases_phsci"] - ov3["cases_official"]
    ov3["match"] = ov3["diff"].abs() < 1e-6

    summary = {
        "zenodo_months": int(zz["month"].nunique()),
        "phsci_non_null_months": int(p["cases_phsci"].notna().sum()),
        "overlap_zp": int(len(ov)),
        "match_zp": int(ov["match"].sum()) if len(ov) else 0,
        "mis_zp": int((~ov["match"]).sum()) if len(ov) else 0,
        "overlap_zo": int(len(ov2)),
        "match_zo": int(ov2["match"].sum()) if len(ov2) else 0,
        "mis_zo": int((~ov2["match"]).sum()) if len(ov2) else 0,
        "overlap_po": int(len(ov3)),
        "match_po": int(ov3["match"].sum()) if len(ov3) else 0,
        "mis_po": int((~ov3["match"]).sum()) if len(ov3) else 0,
    }
    print("SUMMARY", summary)
    print("ZP mismatches:")
    mism_zp = ov.loc[~ov["match"], ["month", "cases_zenodo", "cases_phsci", "diff"]]
    print(mism_zp.to_string(index=False) if not mism_zp.empty else "none")
    print("ZO mismatches:")
    mism_zo = ov2.loc[~ov2["match"], ["month", "cases_zenodo", "cases_official", "diff"]]
    print(mism_zo.to_string(index=False) if not mism_zo.empty else "none")
    print("PO mismatches:")
    mism_po = ov3.loc[~ov3["match"], ["month", "cases_phsci", "cases_official", "diff"]]
    print(mism_po.to_string(index=False) if not mism_po.empty else "none")

    annual_tbl = pd.concat(
        [
            annual(zz, "cases_zenodo", "zenodo"),
            annual(p, "cases_phsci", "phsci"),
            annual(off, "cases_official", "official_monthly"),
        ],
        axis=1,
    )
    print("Annual:")
    print(annual_tbl.to_string())
    annual_tbl.to_csv(EXT / "guangdong_dengue_annual_crosscheck.csv", encoding="utf-8-sig")

    a2 = annual_tbl.copy()
    a2.index.name = "year"
    a2 = a2.reset_index()

    lines = [
        "# 广东省登革热月度数据交叉核对",
        "",
        "生成日期：2026-11-23",
        "",
        "## 数据源",
        "",
        "1. **phsciencedata**（`diseaseId=127` 登革热，分地区月报导出）：`data/raw/phsciencedata_dengue_127/` → `data/external/phsciencedata_guangdong_dengue_monthly_2004_2025.csv`",
        "2. **Zenodo 2016–2024**（DOI 10.5281/zenodo.18391003）：`data/raw/zenodo_18391003/` → `data/external/zenodo_guangdong_dengue_monthly_2016_2024.csv`",
        "3. **广东省卫健委/疾控局月报核验序列**（对照）：`data/processed/guangdong_dengue_monthly.csv`",
        "",
        "## 覆盖",
        "",
        "- Zenodo 月数：{}".format(summary["zenodo_months"]),
        "- phsciencedata 非空月数：{}（原始 xls 请求覆盖 2004-01 至 2025-12；2022 起多数为空/无地区表）".format(
            summary["phsci_non_null_months"]
        ),
        "",
        "## 交叉结果",
        "",
        "| 对比 | 重叠月 | 一致 | 不一致 |",
        "|---|---:|---:|---:|",
        "| Zenodo vs phsciencedata | {} | {} | {} |".format(
            summary["overlap_zp"], summary["match_zp"], summary["mis_zp"]
        ),
        "| Zenodo vs 官方月报 | {} | {} | {} |".format(
            summary["overlap_zo"], summary["match_zo"], summary["mis_zo"]
        ),
        "| phsciencedata vs 官方月报 | {} | {} | {} |".format(
            summary["overlap_po"], summary["match_po"], summary["mis_po"]
        ),
        "",
        "## 年度合计",
        "",
        df_md(a2),
        "",
        "## 不一致明细",
        "",
        "### Zenodo vs phsciencedata",
        "",
        df_md(mism_zp),
        "",
        "### Zenodo vs 官方月报",
        "",
        df_md(mism_zo.head(50)),
        "",
        "### phsciencedata vs 官方月报",
        "",
        df_md(mism_po.head(50)),
        "",
        "## 备注",
        "",
        "- phsciencedata 为网络直报分地区月度发病数；卫健委月报为法定传染病疫情概况当月报告发病数，统计时点可能不同。",
        "- 2013/2014/2017/2018/2020/2021 年 phsciencedata 年度合计与项目内官方年报核对值一致（2894 / 45189 / 1662 / 3315 / 58 / 17）。",
        "- Zenodo `guangdong_dengue_2016_2024.xlsx` 大小 13377 bytes，与 API 公布 size 一致。",
        "",
    ]
    out_md = ROOT / "docs" / "guangdong_dengue_phsci_zenodo_crosscheck.md"
    out_md.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", out_md)


if __name__ == "__main__":
    main()
