#!/usr/bin/env node
/**
 * Weekly ingest from China CDC public pages (no cn_cdc_crawl).
 *
 * 1. Crawl sentinel weekly 表1 into the 11-pathogen table
 * 2. Apply local table-1 / OCR corrections and rebuild week snapshots
 * 3. Recrawl notifiable monthly tables and COVID variant shares
 * 4. Merge the 2022– COVID positivity long series
 * 5. Write data/catalog.json only when a dataset period actually changed
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applySurveillanceFileFixes, rebuildSnapshots } from "./qa-data.mjs";
import { githubWarning } from "./cdc-http.mjs";
import { buildCatalog, catalogHasNewPeriods, readCatalog, summarize, writeCatalog } from "./catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

function emitGithubOutput(catalog, before, { changed }) {
  if (!process.env.GITHUB_OUTPUT) return;
  const sentinel = catalog?.sentinel?.latest_key ?? "";
  const month = catalog?.notifiable?.latest_month ?? "";
  const variants = catalog?.covid_variants?.latest_key ?? "";
  const covid = catalog?.covid_positivity?.latest_key ?? "";
  const newSentinel = sentinel && sentinel !== before?.sentinel?.latest_key ? "true" : "false";
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `changed=${changed ? "true" : "false"}`,
      `sentinel_week=${sentinel}`,
      `notifiable_month=${month}`,
      `variant_week=${variants}`,
      `covid_week=${covid}`,
      `new_sentinel=${newSentinel}`,
      `summary=${catalog ? summarize(catalog) : ""}`,
    ].join("\n") + "\n",
  );
}

mkdirSync(DATA, { recursive: true });
const snapshotsOnly = process.argv.includes("--snapshots-only");
const before = readCatalog();
const crawl = {
  sentinel: { crawl: "ok" },
  notifiable: { crawl: "ok" },
  covid_variants: { crawl: "ok" },
  covid_positivity: { crawl: "ok" },
};

if (!snapshotsOnly) {
  const { crawlSentinel, writeOutputs } = await import("./sync-sentinel.mjs");
  const records = await crawlSentinel();
  if (records.length === 0) throw new Error("no sentinel table1 rows");
  writeOutputs(records);
  const { applied } = applySurveillanceFileFixes();
  for (const row of applied) {
    console.log("qa", row.reference_date, row.pathogen, row.field, `${row.from} -> ${row.to}`);
  }
  if (applied.length) console.log("surveillance corrections", applied.length);
}

const allText = readFileSync(join(DATA, "cncdc_surveillance_all.csv"), "utf8");
console.log("snapshots", rebuildSnapshots(allText));

if (!snapshotsOnly) {
  try {
    const { crawlNotifiable, writeOutputs } = await import("./sync-notifiable.mjs");
    const records = await crawlNotifiable();
    if (records.length === 0) throw new Error("no notifiable rows");
    writeOutputs(records);
  } catch (err) {
    crawl.notifiable = { crawl: "skipped", error: err.message };
    githubWarning(`notifiable crawl skipped: ${err.message}`);
  }
  try {
    const { crawlVariants, writeOutputs } = await import("./sync-covid-variants.mjs");
    const rows = await crawlVariants();
    if (rows.length === 0) throw new Error("no variant rows");
    writeOutputs(rows);
  } catch (err) {
    crawl.covid_variants = { crawl: "skipped", error: err.message };
    githubWarning(`covid variant crawl skipped: ${err.message}`);
  }
}

const catalog = buildCatalog({ previous: before, crawl });
if (!catalogHasNewPeriods(catalog)) {
  console.log("no new periods");
  emitGithubOutput(before ?? catalog, before, { changed: false });
} else {
  writeCatalog(catalog);
  emitGithubOutput(catalog, before, { changed: true });
  console.log("catalog", summarize(catalog));
  if (before?.sentinel?.latest_key && catalog.sentinel?.latest_key !== before.sentinel.latest_key) {
    console.log("new sentinel week", before.sentinel.latest_key, "->", catalog.sentinel.latest_key);
  } else {
    console.log("sentinel week", catalog.sentinel?.latest_key ?? "(none)");
  }
  console.log(
    "covid positivity",
    catalog.covid_positivity?.latest_key ?? "(none)",
    "weeks",
    catalog.covid_positivity?.weeks ?? 0,
  );
}
if (catalog.notifiable?.crawl === "skipped") {
  console.log("notifiable skipped", catalog.notifiable.error);
}
if (catalog.covid_variants?.crawl === "skipped") {
  console.log("covid variants skipped", catalog.covid_variants.error);
}
