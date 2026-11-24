#!/usr/bin/env python3
"""Weekly check: refresh official monthly bulletins and rebuild cleaned history.

Guangdong dengue case counts are published monthly, not weekly. Run this script
once a week to detect whether a new month has been posted.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    py = sys.executable
    run([py, "scripts/build_guangdong_dengue_monthly.py"])
    run([py, "scripts/build_guangdong_dengue_cleaned_history.py"])
    run([py, "scripts/export_guangdong_dengue_dashboard.py"])
    cleaned = ROOT / "data" / "processed" / "guangdong_dengue_monthly_cleaned_2004_present.csv"
    export = ROOT / "data" / "export" / "guangdong_dengue_monthly.csv"
    print(f"cleaned_history={cleaned}")
    print(f"dashboard_export={export}")


if __name__ == "__main__":
    main()
