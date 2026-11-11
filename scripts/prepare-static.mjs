#!/usr/bin/env node
/**
 * Copy committed CSVs into public/download and emit Parquet siblings
 * so `output: "export"` can serve them as static files.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parquetWriteFile } from "hyparquet-writer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "public", "download");

const MAIN_FILES = [
  "cncdc_surveillance_all.csv",
  "cncdc_surveillance_covid19.csv",
  "cncdc_suverillance_2025_14_22.csv",
  "notifiable_all.csv",
  "covid_variants.csv",
  "cnic_influenza_weekly.csv",
];

const FLOAT_COLS = new Set([
  "ili_percent",
  "sari_percent",
  "share",
  "ili_south",
  "ili_north",
  "positivity_south",
  "positivity_north",
  "positivity_national",
  "h1_share",
  "h3_share",
  "bvic_share",
  "byam_share",
]);
const INT_COLS = new Set([
  "report_week",
  "year",
  "week",
  "cases",
  "deaths",
  "sequences",
  "tests_south",
  "tests_north",
  "tests_national",
  "positives_south",
  "positives_north",
  "positives_national",
  "a_south",
  "a_north",
  "a_national",
  "h1_south",
  "h1_north",
  "h1_national",
  "h3_south",
  "h3_north",
  "h3_national",
  "b_south",
  "b_north",
  "b_national",
  "bvic_south",
  "bvic_north",
  "bvic_national",
  "byam_south",
  "byam_north",
  "byam_national",
  "a_unsub_south",
  "a_unsub_north",
  "a_unsub_national",
  "b_untyped_south",
  "b_untyped_north",
  "b_untyped_national",
  "outbreaks",
]);

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function writeParquet(csv, dest) {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 1) return;
  const header = lines[0].split(",").map((h) => h.trim());
  const columns = header.map((name) => ({
    name,
    data: [],
    type: FLOAT_COLS.has(name) ? "DOUBLE" : INT_COLS.has(name) ? "INT32" : "STRING",
  }));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = line.split(",");
    for (let i = 0; i < columns.length; i++) {
      const raw = values[i] ?? "";
      const col = columns[i];
      if (col.type === "STRING") {
        col.data.push(raw);
      } else {
        const n = Number(raw);
        col.data.push(raw === "" || !Number.isFinite(n) ? null : n);
      }
    }
  }
  parquetWriteFile({ filename: dest, columnData: columns });
}

function writeCsvAndParquet(relPath, csv) {
  const dest = join(OUT, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, csv.endsWith("\n") ? csv : `${csv}\n`);
  writeParquet(csv, dest.replace(/\.csv$/i, ".parquet"));
}

function copyMain(name) {
  writeCsvAndParquet(name, readFileSync(join(DATA, name), "utf8"));
}

function copyDir(subdir) {
  const src = join(DATA, subdir);
  for (const name of readdirSync(src)) {
    if (!name.endsWith(".csv")) continue;
    writeCsvAndParquet(join(subdir, name), readFileSync(join(src, name), "utf8"));
  }
}

function notifiableMetricCsv(metric) {
  const header = `reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,${metric}`;
  const body = parseCsv(readFileSync(join(DATA, "notifiable_all.csv"), "utf8"))
    .filter((row) => row.row_kind !== "summary")
    .map((row) =>
      [
        row.reference_date,
        row.target_end_date,
        row.month,
        row.report_date,
        csvCell(row.disease),
        row.disease_class,
        row.row_kind,
        row[metric],
      ].join(","),
    );
  return [header, ...body].join("\n") + "\n";
}

function sentinelMetricCsv(metric) {
  const header = `reference_date,target_end_date,report_week,pathogen,${metric}`;
  const body = parseCsv(readFileSync(join(DATA, "cncdc_surveillance_all.csv"), "utf8")).map((row) =>
    [row.reference_date, row.target_end_date, row.report_week, csvCell(row.pathogen), row[metric] ?? ""].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}

function cnicColumnsCsv(columns, derive = {}) {
  const header = ["reference_date", "target_end_date", "year", "week", ...columns];
  const body = parseCsv(readFileSync(join(DATA, "cnic_influenza_weekly.csv"), "utf8")).map((row) => {
    const derived = {};
    for (const [name, fn] of Object.entries(derive)) derived[name] = fn(row);
    return header.map((name) => derived[name] ?? row[name] ?? "").join(",");
  });
  return [header.join(","), ...body].join("\n") + "\n";
}

function subtypeShare(countName) {
  return (row) => {
    const count = row[countName];
    const denom = row.positives_national;
    if (count === "" || count == null || denom === "" || denom == null || Number(denom) <= 0) return "";
    return String(Math.round((Number(count) / Number(denom)) * 1000) / 10);
  };
}

function covidPositivityCsv() {
  const header = "reference_date,target_end_date,report_week,ili_percent,sari_percent";
  const body = parseCsv(readFileSync(join(DATA, "cncdc_surveillance_covid19.csv"), "utf8"))
    .filter((row) => row.pathogen === "新型冠状病毒")
    .map((row) =>
      [row.reference_date, row.target_end_date, row.report_week, row.ili_percent ?? "", row.sari_percent ?? ""].join(
        ",",
      ),
    );
  return [header, ...body].join("\n") + "\n";
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of MAIN_FILES) copyMain(file);
copyDir("snapshots");
copyDir("notifiable");

writeCsvAndParquet("charts/notifiable-cases.csv", notifiableMetricCsv("cases"));
writeCsvAndParquet("charts/notifiable-deaths.csv", notifiableMetricCsv("deaths"));
writeCsvAndParquet("charts/sentinel-ili.csv", sentinelMetricCsv("ili_percent"));
writeCsvAndParquet("charts/sentinel-sari.csv", sentinelMetricCsv("sari_percent"));
writeCsvAndParquet("charts/covid-positivity.csv", covidPositivityCsv());
writeCsvAndParquet(
  "charts/cnic-ili.csv",
  cnicColumnsCsv(["ili_south", "ili_north"]),
);
writeCsvAndParquet(
  "charts/cnic-positivity.csv",
  cnicColumnsCsv(["positivity_south", "positivity_north", "positivity_national"]),
);
writeCsvAndParquet(
  "charts/cnic-subtypes.csv",
  cnicColumnsCsv(
    ["positives_national", "h1_national", "h3_national", "bvic_national", "byam_national", "h1_share", "h3_share", "bvic_share", "byam_share"],
    {
      h1_share: subtypeShare("h1_national"),
      h3_share: subtypeShare("h3_national"),
      bvic_share: subtypeShare("bvic_national"),
      byam_share: subtypeShare("byam_national"),
    },
  ),
);

console.log("prepared", OUT);
