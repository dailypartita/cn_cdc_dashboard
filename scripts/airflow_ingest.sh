#!/usr/bin/env bash
# Backup ingest on an Airflow worker (GitHub Actions is the scheduled runner):
# pull, crawl CDC pages, commit data/, push main.
set -euo pipefail

ROOT="${CDC_DASHBOARD_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${CDC_DASHBOARD_BRANCH:-main}"
REMOTE="${CDC_DASHBOARD_REMOTE:-origin}"

cd "$ROOT"

if ! command -v node >/dev/null; then
  echo "node is required (18+)" >&2
  exit 1
fi

git fetch "$REMOTE" "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

node scripts/sync-data.mjs

git add data
if git diff --cached --quiet; then
  echo "No data changes; skip push."
  exit 0
fi

MSG="chore: weekly CDC ingest $(date -u +%Y-%m-%d)"
if [[ -n "${GIT_AUTHOR_NAME:-}" && -n "${GIT_AUTHOR_EMAIL:-}" ]]; then
  git -c "user.name=${GIT_AUTHOR_NAME}" -c "user.email=${GIT_AUTHOR_EMAIL}" commit -m "$MSG"
else
  git commit -m "$MSG"
fi

git push "$REMOTE" "$BRANCH"
echo "Pushed $MSG"
