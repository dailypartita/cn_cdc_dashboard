#!/usr/bin/env python3
"""Export cleaned Guangdong dengue history into the Forecast Dashboard CSV schema.

Writes data/export/guangdong_dengue_monthly.csv with columns:
  date,year_month,cases,deaths,source,source_url

Missing months keep an empty cases cell (chart shows a break; do not invent 0).
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLEANED = ROOT / "data" / "processed" / "guangdong_dengue_monthly_cleaned_2004_present.csv"
OUT = ROOT / "data" / "export" / "guangdong_dengue_monthly.csv"

SOURCE_LABEL = {
    "official_bulletin": "广东省卫健委/疾控局法定传染病月报",
    "phsciencedata": "公共卫生科学数据中心（经 globalID2 整理）",
    "zenodo_2016_2024": "Zenodo 整理数据集（Lin 等, 2016–2024）",
}

SOURCE_FALLBACK_URL = {
    "phsciencedata": "https://www.phsciencedata.cn/Share/ky_sjml.jsp",
    "zenodo_2016_2024": "https://doi.org/10.5281/zenodo.18391003",
}


def main() -> None:
    with CLEANED.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    out_rows: list[dict[str, str]] = []
    for row in rows:
        month = (row.get("month") or "").strip()
        if not month:
            continue
        cases_raw = (row.get("cases") or "").strip()
        source_key = (row.get("source_primary") or "").strip()
        source_url = (row.get("source_url") or "").strip()
        if not source_url:
            source_url = SOURCE_FALLBACK_URL.get(source_key, "")
        out_rows.append(
            {
                "date": f"{month}-01",
                "year_month": month,
                "cases": cases_raw,
                "deaths": "",
                "source": SOURCE_LABEL.get(source_key, source_key),
                "source_url": source_url,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["date", "year_month", "cases", "deaths", "source", "source_url"],
        )
        writer.writeheader()
        writer.writerows(out_rows)

    with_cases = sum(1 for r in out_rows if r["cases"] != "")
    print(f"dashboard_export={OUT} rows={len(out_rows)} with_cases={with_cases}")


if __name__ == "__main__":
    main()
