#!/usr/bin/env node
/**
 * Rebuild the CNIC weekly ILI% / positivity archive.
 *
 * 1. Read every public CNIC weekly HTML page (current listing and the
 *    older listing back to 2009-W36).
 * 2. Fill blanks from Zenodo 10.5281/zenodo.22784835 (CC BY 4.0).
 *    Official HTML/PDF values overwrite that extract field by field.
 * 3. Download PDFs only for weeks that still have no ILI%.
 *
 * Writes data/cnic_influenza_weekly.csv and data/backfill/cnic-influenza-weekly.csv.
 * sync-cnic merges the backfill file back in, so a later crawl of only the
 * newest listing pages does not drop this history.
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildCatalog, readCatalog, writeCatalog } from "./catalog.mjs";
import {
  CNIC_BACKFILL_META,
  ZENODO_RECORD,
  cnicCoverage,
  isoWeekRange,
  mergeCnicPreferIncoming,
  parseCsv,
  rowsFromZenodo,
  weekKeyOf,
  writeCnicFiles,
} from "./cnic-weekly.mjs";
import { crawlCnicPages, parseMissingPdfs, parsePdfLink } from "./sync-cnic.mjs";

const execFileAsync = promisify(execFile);
const ZENODO_ZIP = "https://zenodo.org/api/records/22784835/files/nowcasting-ili-dataset.zip/content";

function iliDiffs(official, zenodo) {
  const base = new Map(zenodo.map((row) => [weekKeyOf(row.year, row.week), row]));
  const diffs = [];
  for (const row of official) {
    const other = base.get(weekKeyOf(row.year, row.week));
    if (!other || other.ili_south == null || row.ili_south == null) continue;
    const south = Math.abs(row.ili_south - other.ili_south);
    const north =
      other.ili_north == null || row.ili_north == null ? 0 : Math.abs(row.ili_north - other.ili_north);
    if (south > 0.15 || north > 0.15) {
      diffs.push({
        week: weekKeyOf(row.year, row.week),
        html_south: row.ili_south,
        zenodo_south: other.ili_south,
        html_north: row.ili_north,
        zenodo_north: other.ili_north,
      });
    }
  }
  return diffs;
}

async function main() {
  console.log("download zenodo", ZENODO_RECORD);
  let panel;
  let manifest;
  try {
    const zip = await execFileAsync("curl", ["-fsSL", "-o", "/tmp/cnic-zenodo.zip", ZENODO_ZIP]);
    void zip;
    panel = (await execFileAsync("unzip", ["-p", "/tmp/cnic-zenodo.zip", "nowcasting-ili-dataset/data/cnic_weekly_panel.csv"])).stdout;
    manifest = (await execFileAsync("unzip", ["-p", "/tmp/cnic-zenodo.zip", "nowcasting-ili-dataset/data/cnic_manifest.csv"])).stdout;
  } catch (err) {
    throw new Error(`zenodo download failed: ${err.message}`);
  }
  const zenodo = rowsFromZenodo(panel, manifest);
  console.log("zenodo rows", zenodo.length);
  const weekEndDiffs = [];
  for (const row of parseCsv(panel)) {
    const range = isoWeekRange(row.year, row.week);
    if (row.week_end && row.week_end !== range.target_end_date) {
      weekEndDiffs.push(`${row.year}-W${row.week} ${row.week_end} vs ${range.target_end_date}`);
    }
  }
  if (weekEndDiffs.length) {
    console.log(weekEndDiffs.slice(0, 8).join("\n"));
    throw new Error(`${weekEndDiffs.length} Zenodo week_end values disagree with ISO Sundays`);
  }

  const parsed = await crawlCnicPages({ pages: 0, archive: true, concurrency: 6 });
  const htmlRows = parsed.map((item) => item.row).filter(Boolean);
  console.log("html rows", htmlRows.length, "of", parsed.length);
  const diffs = iliDiffs(htmlRows, zenodo);
  console.log("ili disagreements >0.15pp", diffs.length);
  for (const diff of diffs.slice(0, 25)) console.log(" diff", diff.week, diff);
  if (diffs.length > 25) {
    throw new Error(`${diffs.length} ILI% disagreements between HTML and Zenodo; not writing`);
  }

  let merged = mergeCnicPreferIncoming(zenodo, htmlRows);
  const covered = new Set(merged.filter((row) => row.ili_south != null).map((row) => weekKeyOf(row.year, row.week)));
  const missing = parsed.filter((item) => item.pdfUrl && !covered.has(weekKeyOf(item.link.year, item.link.week)));
  console.log(
    "pdf candidates",
    missing.length,
    missing.map((item) => weekKeyOf(item.link.year, item.link.week)).join(" "),
  );
  const pdfRows = await parseMissingPdfs(parsed, { pdfLimit: missing.length, rows: merged });
  merged = mergeCnicPreferIncoming(merged, pdfRows);
  const byKey = new Map(merged.map((row) => [weekKeyOf(row.year, row.week), row]));
  const positivityHoles = parsed.filter((item) => {
    if (!item.pdfUrl || item.link.year < 2020) return false;
    const row = byKey.get(weekKeyOf(item.link.year, item.link.week));
    if (!row) return false;
    return row.positivity_south == null && row.positivity_north == null && row.positivity_national == null;
  });
  console.log("positivity pdf candidates", positivityHoles.length);
  const positivityRows = [];
  for (let i = 0; i < positivityHoles.length; i += 3) {
    const batch = positivityHoles.slice(i, i + 3);
    const parsedBatch = await Promise.all(
      batch.map(async (item) => {
        try {
          return await parsePdfLink(item, undefined);
        } catch (err) {
          console.log("positivity pdf skip", weekKeyOf(item.link.year, item.link.week), err.message);
          return null;
        }
      }),
    );
    positivityRows.push(...parsedBatch.filter(Boolean));
    if (i % 15 === 0) console.log("positivity pdf", Math.min(i + 3, positivityHoles.length), "/", positivityHoles.length);
  }
  merged = mergeCnicPreferIncoming(merged, positivityRows);

  const week44 = merged.find((row) => row.year === 2026 && row.week === 44);
  const week41 = merged.find((row) => row.year === 2016 && row.week === 41);
  if (!week44 || week44.ili_south !== 4.8 || week44.positivity_national !== 12.4) {
    throw new Error(`2026-W44 parse mismatch: ${JSON.stringify(week44)}`);
  }
  if (!week41 || week41.ili_south !== 2.5 || week41.tests_national !== 5444) {
    throw new Error(`2016-W41 parse mismatch: ${JSON.stringify(week41)}`);
  }

  const dateMismatches = [];
  for (const row of zenodo) {
    const range = isoWeekRange(row.year, row.week);
    if (row.reference_date !== range.reference_date) dateMismatches.push(weekKeyOf(row.year, row.week));
  }
  if (dateMismatches.length) {
    throw new Error(`ISO week dates disagree with Zenodo keys: ${dateMismatches.slice(0, 8).join(", ")}`);
  }

  writeCnicFiles(merged);
  const coverage = cnicCoverage(merged);
  const extracts = {};
  for (const row of merged) {
    for (const tag of `${row.ili_extract || ""}+${row.lab_extract || ""}`.split("+")) {
      if (!tag) continue;
      extracts[tag] = (extracts[tag] ?? 0) + 1;
    }
  }
  const meta = {
    compiled_from: [
      "https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/",
      "https://ivdc.chinacdc.cn/lgzx/zyzx/lgzb/",
      ZENODO_RECORD,
    ],
    license_note: "Zenodo extract CC BY 4.0 (Zhao, Quanjingbo, 2026). CNIC report text is quoted from the public originals and is not relicensed.",
    retrieved_at: new Date().toISOString(),
    zenodo_doi: "10.5281/zenodo.22784835",
    rows: merged.length,
    coverage,
    extract_field_counts: extracts,
    ili_disagreements: diffs,
    pdf_weeks: pdfRows.map((row) => weekKeyOf(row.year, row.week)),
    notes: [
      "ILI% is the CNIC sentinel outpatient/emergency influenza-like illness percentage, south and north separately.",
      "Positivity is influenza-positive specimens divided by ILI specimens tested, not the later 11-pathogen sentinel 流感病毒 nucleic-acid positivity.",
      "Reports that split 内科 and 儿内科 ILI% are not folded into ili_south / ili_north.",
      "Official HTML or PDF values overwrite Zenodo on the same field. Nulls do not erase a stored value.",
      "When a report prints national tests and both regional positive counts but not the percent, positivity_national is positives/tests rounded to 0.1.",
      "sync-cnic writeOutputs merges this backfill under any newly parsed weeks.",
    ],
  };
  mkdirSync(dirname(CNIC_BACKFILL_META), { recursive: true });
  writeFileSync(CNIC_BACKFILL_META, `${JSON.stringify(meta, null, 2)}\n`);
  const catalog = writeCatalog(buildCatalog({ previous: readCatalog(), crawl: { cnic: { crawl: "ok" } } }));
  console.log(JSON.stringify({ coverage, catalog_cnic: catalog.cnic }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
