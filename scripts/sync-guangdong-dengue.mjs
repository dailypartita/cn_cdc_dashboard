#!/usr/bin/env node
/**
 * Guangdong provincial dengue: monthly bulletins, weekly check.
 *
 * Case counts are monthly (卫健委 / 疾控局疫情概况). This job runs on the
 * same daily ingest as other CDC sources so a mid-month bulletin is picked
 * up without waiting for a separate cron. Missing months stay blank.
 *
 * Writes:
 *   data/processed/guangdong_dengue_monthly.csv
 *   data/processed/guangdong_dengue_monthly_cleaned_2004_present.csv
 *   data/export/guangdong_dengue_monthly.csv  (Forecast Dashboard schema)
 *   data/metadata/guangdong_dengue_sources.csv
 *   data/raw/guangdong_dengue_reports/  (bulletin HTML/DOCX)
 *   docs/guangdong_monthly_*.md
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = join(ROOT, "scripts", "update_guangdong_dengue_weekly_check.py");
const CLEANED = join(
  ROOT,
  "data",
  "processed",
  "guangdong_dengue_monthly_cleaned_2004_present.csv",
);

function pythonBinary() {
  return process.env.PYTHON || process.env.PYTHON3 || "python3";
}

export function syncGuangdongDengue() {
  if (!existsSync(CHECK)) {
    throw new Error(`missing ${CHECK}`);
  }
  const py = pythonBinary();
  const result = spawnSync(py, [CHECK], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout?.trim()) process.stdout.write(result.stdout);
  if (result.stderr?.trim()) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `guangdong dengue sync failed (exit ${result.status ?? "null"})`,
    );
  }
  return { cleaned: CLEANED };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  syncGuangdongDengue();
  console.log("guangdong dengue cleaned", CLEANED);
}
