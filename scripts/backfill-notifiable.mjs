#!/usr/bin/env node
/**
 * Refresh historical 登革热 / 流行性感冒 from stone-zeng and merge them
 * in front of the official China CDC rows.
 *
 *   npm run backfill-notifiable
 *
 * Overlapping (month, disease) keys already in the official table are not
 * replaced. The crawl in sync-notifiable.mjs reads the committed extract
 * on every later official sync.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildCatalog, readCatalog, writeCatalog } from "./catalog.mjs";
import {
  BACKFILL_CSV,
  BACKFILL_DISEASES,
  BACKFILL_META,
  NOTIFIABLE_CSV,
  STONE_ZENG_REPO,
  buildHistoricalRows,
  isCompiledBackfillRow,
  missingSourceMonths,
  officialCoverageStart,
  omittedSparseInfluenza,
  overlapMismatches,
  parseCsv,
  parseNotifiableCsv,
  parseUpstreamLinks,
  recordsToCsv,
  separateMislabeledMonths,
} from "./notifiable-backfill.mjs";
import { writeOutputs } from "./sync-notifiable.mjs";

const BRANCH = "main";
const RAW = `https://raw.githubusercontent.com/stone-zeng/china-infectious-diseases/${BRANCH}`;
const CASES_URL = `${RAW}/data/monthly-cases.csv`;
const DEATHS_URL = `${RAW}/data/monthly-deaths.csv`;
const README_URL = `${RAW}/README.md`;
const COMMIT_URL = `https://api.github.com/repos/stone-zeng/china-infectious-diseases/commits/${BRANCH}`;

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "cn-cdc-dashboard-backfill",
      accept,
    },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

async function fetchCommit() {
  try {
    const response = await fetch(COMMIT_URL, {
      headers: {
        "user-agent": "cn-cdc-dashboard-backfill",
        accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.sha === "string" ? body.sha : null;
  } catch {
    return null;
  }
}

function summarizeDisease(rows, disease) {
  const months = rows.filter((row) => row.disease === disease).map((row) => row.month).sort();
  if (!months.length) return `${disease}: 0`;
  const deathsMissing = rows.filter((row) => row.disease === disease && row.deaths == null).length;
  return `${disease}: ${months[0]}–${months[months.length - 1]} ${months.length} months, deaths blank ${deathsMissing}`;
}

export async function backfillNotifiable() {
  const [casesText, deathsText, readme, commit] = await Promise.all([
    fetchText(CASES_URL, "text/csv,*/*"),
    fetchText(DEATHS_URL, "text/csv,*/*"),
    fetchText(README_URL, "text/plain,*/*"),
    fetchCommit(),
  ]);
  const parsedCases = parseCsv(casesText);
  const parsedDeaths = parseCsv(deathsText);
  const aligned = separateMislabeledMonths(parsedCases, parsedDeaths);
  const caseRows = aligned.caseRows;
  const deathRows = aligned.deathRows;
  const links = parseUpstreamLinks(readme);
  const current = parseNotifiableCsv(readFileSync(NOTIFIABLE_CSV, "utf8"));
  const beforeMonth = officialCoverageStart(current);
  if (!beforeMonth) {
    throw new Error("official notifiable table has no months; refuse to backfill over an empty file");
  }
  const kept = current.filter((row) => !isCompiledBackfillRow(row));
  const historical = buildHistoricalRows({ caseRows, deathRows, links, beforeMonth });
  const sparse = omittedSparseInfluenza(caseRows, deathRows);
  const sourceGaps = missingSourceMonths(caseRows);
  const mismatches = overlapMismatches(caseRows, deathRows, kept);
  const deathsMissing = historical
    .filter((row) => row.deaths == null)
    .map((row) => ({ month: row.month, disease: row.disease }));

  mkdirSync(dirname(BACKFILL_CSV), { recursive: true });
  writeFileSync(BACKFILL_CSV, recordsToCsv(historical));
  const meta = {
    compiled_from: STONE_ZENG_REPO,
    license: "CC0-1.0",
    commit,
    retrieved_at: new Date().toISOString(),
    files: ["data/monthly-cases.csv", "data/monthly-deaths.csv", "README.md"],
    official_coverage_starts: beforeMonth,
    diseases: BACKFILL_DISEASES,
    source_months_missing: sourceGaps,
    relabeled_months: aligned.relabeled,
    unresolved_duplicate_months: aligned.unresolved,
    omitted_sparse_influenza: sparse,
    deaths_missing: deathsMissing,
    overlap_mismatches: mismatches,
    notes: [
      "Historical rows stop before the first month of this repo's official China CDC table.",
      "Official (month, disease) rows are never overwritten. sync-notifiable writeOutputs merges this extract back in.",
      "2013-11 起甲型H1N1流感并入丙类流行性感冒，此前单独列报，未加进流行性感冒。",
      "禽流感、新亚型流感保持各自病名，不并入流行性感冒。哨点流感病毒阳性率是另一套周序列。",
      "Blank source cells are omitted. Reported zeros are kept.",
    ],
  };
  writeFileSync(BACKFILL_META, `${JSON.stringify(meta, null, 2)}\n`);
  writeOutputs(kept);
  writeCatalog(buildCatalog({ previous: readCatalog() }));
  console.log(
    "backfill",
    historical.length,
    "rows before",
    beforeMonth,
    "source gaps",
    sourceGaps.join(",") || "(none)",
    "overlap mismatches",
    mismatches.length,
    "commit",
    commit ?? "(unknown)",
  );
  for (const spec of BACKFILL_DISEASES) console.log(summarizeDisease(historical, spec.disease));
  if (sparse.length) {
    console.log(
      "omitted sparse influenza",
      sparse.map((row) => `${row.month} cases=${row.cases} deaths=${row.deaths ?? "blank"}`).join("; "),
    );
  }
  return meta;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await backfillNotifiable();
}
