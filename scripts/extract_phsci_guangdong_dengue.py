#!/usr/bin/env python3
"""Extract Guangdong rows from downloaded phsciencedata dengue region monthly XLS files."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "phsciencedata_dengue_127"
OUT = ROOT / "data" / "external"
NS = "{urn:schemas-microsoft-com:office:spreadsheet}"


def extract_gd(path: Path):
    raw = path.read_bytes()
    if len(raw) < 6000:
        return "empty_file", None
    root = ET.fromstring(raw)
    for row in root.findall(f".//{NS}Row"):
        vals = []
        for cell in row.findall(f"{NS}Cell"):
            data = cell.find(f"{NS}Data")
            vals.append(data.text if data is not None else "")
        joined = "".join(v or "" for v in vals)
        if "广东" not in joined:
            continue
        nums = []
        for v in vals:
            if not v or "广东" in v or "地" in v:
                continue
            try:
                nums.append(float(v))
            except ValueError:
                pass
        if nums:
            cases = nums[0]
            deaths = nums[1] if len(nums) > 1 else np.nan
            incidence = nums[2] if len(nums) > 2 else np.nan
            mortality = nums[3] if len(nums) > 3 else np.nan
            return "ok", (cases, deaths, incidence, mortality)
        return "gd_row_no_nums", None

    has_region = False
    for row in root.findall(f".//{NS}Row"):
        for cell in row.findall(f"{NS}Cell"):
            data = cell.find(f"{NS}Data")
            if data is not None and data.text and any(
                token in data.text for token in ["省", "市", "全国", "自治区"]
            ):
                has_region = True
                break
    if has_region:
        return "no_gd_impute0", (0.0, 0.0, 0.0, 0.0)
    return "no_data", None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    status_counts: dict[str, int] = {}
    files = sorted(
        RAW.glob("*.xls"),
        key=lambda p: (int(p.stem.split("-")[0]), int(p.stem.split("-")[1])),
    )
    for path in files:
        year, month = map(int, path.stem.split("-"))
        status, vals = extract_gd(path)
        status_counts[status] = status_counts.get(status, 0) + 1
        month_key = f"{year:04d}-{month:02d}"
        if vals is None:
            records.append(
                {
                    "month": month_key,
                    "location": "GD",
                    "cases": np.nan,
                    "deaths": np.nan,
                    "incidence_per_100k": np.nan,
                    "mortality_per_100k": np.nan,
                    "quality_status": status,
                    "source": "phsciencedata.cn ReportZoneMonth diseaseId=127",
                }
            )
        else:
            cases, deaths, incidence, mortality = vals
            records.append(
                {
                    "month": month_key,
                    "location": "GD",
                    "cases": cases,
                    "deaths": deaths,
                    "incidence_per_100k": incidence,
                    "mortality_per_100k": mortality,
                    "quality_status": "verified" if status == "ok" else status,
                    "source": "phsciencedata.cn ReportZoneMonth diseaseId=127",
                }
            )

    gd = pd.DataFrame(records)
    gd_path = OUT / "phsciencedata_guangdong_dengue_monthly_2004_2025.csv"
    gd.to_csv(gd_path, index=False, encoding="utf-8-sig")

    annual = gd.dropna(subset=["cases"]).copy()
    annual["year"] = annual["month"].str[:4]
    annual_sum = annual.groupby("year", as_index=False).agg(
        cases=("cases", "sum"), months=("month", "count")
    )
    annual_sum.to_csv(
        OUT / "phsciencedata_guangdong_dengue_annual_2004_2025.csv",
        index=False,
        encoding="utf-8-sig",
    )
    print("status", status_counts)
    print("wrote", gd_path)
    print(annual_sum.to_string(index=False))


if __name__ == "__main__":
    main()
