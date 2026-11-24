#!/usr/bin/env python3
"""Download Guangdong-relevant dengue monthly region tables from phsciencedata.cn.

Uses the same ReportZoneMonth export URL pattern as phsciencedata_crawler_region
(diseaseId=127 = 登革热).
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import requests

DEFAULT_OUT = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "raw"
    / "phsciencedata_dengue_127"
)
DISEASE_ID = 127


def month_url(year: int, month: int, disease_id: int = DISEASE_ID) -> str:
    return (
        "https://www.phsciencedata.cn/Share/frameset"
        "?__report=ReportZoneMonth.rptdesign&__title=&__showtitle=false"
        "&__toolbar=true&__navigationbar=true&&__format=xls&__locale=zh_CN"
        "&__clean=true&__filename=%E5%8D%A0%E4%BD%8D%E7%AC%A6"
        f"&years={year}&diseaseId={disease_id}&months={month}"
        "&&__dpi=96&__asattachment=true&__overwrite=false"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-year", type=int, default=2004)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--sleep", type=float, default=0.15)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (research; dengue archive)"})

    ok = skip = fail = 0
    for year in range(args.start_year, args.end_year + 1):
        for month in range(1, 13):
            path = args.out / f"{year}-{month}.xls"
            if path.exists() and path.stat().st_size > 1000:
                skip += 1
                continue
            url = month_url(year, month)
            for attempt in range(3):
                try:
                    resp = session.get(url, timeout=60)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        path.write_bytes(resp.content)
                        ok += 1
                        break
                except Exception as exc:  # noqa: BLE001
                    if attempt == 2:
                        fail += 1
                        print("FAIL", year, month, exc)
                    time.sleep(1.5 * (attempt + 1))
            else:
                fail += 1
                print("FAIL status", year, month)
            time.sleep(args.sleep)
        print(f"year {year} done; ok={ok} skip={skip} fail={fail}")

    print({"ok": ok, "skip": skip, "fail": fail, "files": len(list(args.out.glob("*.xls")))})


if __name__ == "__main__":
    main()
