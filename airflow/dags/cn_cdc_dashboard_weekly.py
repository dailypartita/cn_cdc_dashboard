"""Weekly China CDC ingest. Copy or symlink into $AIRFLOW_HOME/dags/.

Environment (Airflow worker):
  CDC_DASHBOARD_ROOT   clone of this repo (default /opt/cn_cdc_dashboard)
  CDC_DASHBOARD_BRANCH git branch to update (default main)
  CDC_DASHBOARD_REMOTE git remote (default origin)
  GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL  used only if git user.* is unset on the worker

The worker needs Node 18+, git, and push access to GitHub (SSH deploy key or HTTPS token).
After a successful push, .github/workflows/pages.yml builds and deploys GitHub Pages.
"""

from __future__ import annotations

import os
import shlex
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

ROOT = os.environ.get("CDC_DASHBOARD_ROOT", "/opt/cn_cdc_dashboard")

with DAG(
    dag_id="cn_cdc_dashboard_weekly",
    description="Crawl China CDC public tables, commit data/, push main for GitHub Pages",
    # Friday 12:00 Asia/Shanghai when the scheduler timezone is UTC.
    # If AIRFLOW__CORE__DEFAULT_TIMEZONE=Asia/Shanghai, use 0 12 * * 5 instead.
    schedule="0 4 * * 5",
    start_date=datetime(2026, 1, 2),
    catchup=False,
    max_active_runs=1,
    default_args={
        "retries": 2,
        "retry_delay": timedelta(hours=1),
    },
    tags=["cdc", "dashboard"],
) as dag:
    BashOperator(
        task_id="ingest_and_push",
        bash_command=(
            f"export CDC_DASHBOARD_ROOT={shlex.quote(ROOT)}; "
            f"bash {shlex.quote(os.path.join(ROOT, 'scripts/airflow_ingest.sh'))}"
        ),
    )
