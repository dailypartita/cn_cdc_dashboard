#!/usr/bin/env bash
# Copy data/export/guangdong_dengue_monthly.csv into the Forecast Dashboard
# resources tree and push. A deploy-key push starts Rebuild Site.
#
# Required environment:
#   DEPLOY_KEY   private key with write access to TARGET_REPO
# Optional:
#   TARGET_REPO  owner/name (default dailypartita/China-Infectious-Disease-Forecast-Dashboard)
#   TARGET_PATH  path in that repo (default pages/resources/guangdong_dengue_monthly.csv)
#   SOURCE_CSV   local export path (default data/export/guangdong_dengue_monthly.csv)
#   REF          noted in the commit message
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_CSV="${SOURCE_CSV:-$ROOT/data/export/guangdong_dengue_monthly.csv}"
TARGET_REPO="${TARGET_REPO:-dailypartita/China-Infectious-Disease-Forecast-Dashboard}"
TARGET_PATH="${TARGET_PATH:-pages/resources/guangdong_dengue_monthly.csv}"
REF="${REF:-local}"

if [[ -z "${DEPLOY_KEY:-}" ]]; then
  echo "DASHBOARD_DEPLOY_KEY unset; skip Forecast Dashboard push"
  exit 0
fi
if [[ ! -f "$SOURCE_CSV" ]]; then
  echo "missing export CSV: $SOURCE_CSV" >&2
  exit 1
fi
if [[ ! "$TARGET_REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "invalid TARGET_REPO" >&2
  exit 1
fi

key_file="$(mktemp)"
workdir="$(mktemp -d)"
cleanup() {
  rm -f "$key_file"
  rm -rf "$workdir"
}
trap cleanup EXIT

printf '%s\n' "$DEPLOY_KEY" > "$key_file"
chmod 600 "$key_file"
install -d -m 700 "${HOME}/.ssh"
if ! ssh-keyscan -t ed25519 github.com >> "${HOME}/.ssh/known_hosts"; then
  echo "ssh-keyscan failed" >&2
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i ${key_file} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes"
git clone --depth 1 "git@github.com:${TARGET_REPO}.git" "${workdir}/repo"
git -C "${workdir}/repo" config user.name "github-actions[bot]"
git -C "${workdir}/repo" config user.email "41898282+github-actions[bot]@users.noreply.github.com"

dest="${workdir}/repo/${TARGET_PATH}"
mkdir -p "$(dirname "$dest")"
cp "$SOURCE_CSV" "$dest"
git -C "${workdir}/repo" add -- "$TARGET_PATH"
if git -C "${workdir}/repo" diff --cached --quiet; then
  echo "${TARGET_REPO} already has current Guangdong dengue CSV"
  exit 0
fi
git -C "${workdir}/repo" commit -m "data: sync Guangdong dengue monthly series from cn_cdc_dashboard (${REF})"
git -C "${workdir}/repo" push origin HEAD:main
echo "pushed ${TARGET_PATH} to ${TARGET_REPO}"
