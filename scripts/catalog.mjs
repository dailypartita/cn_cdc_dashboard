/**
 * Snapshot of the latest period in each committed CSV.
 * Homepage / CSV / API dates are derived from the CSVs themselves;
 * this file is the ingest receipt (commit messages, /api/v1/status).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
export const CATALOG_PATH = join(DATA, "catalog.json");

function isoWeekYear(referenceDate) {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 3);
  return date.getUTCFullYear();
}

function weekKey(referenceDate, reportWeek) {
  return `${isoWeekYear(referenceDate)}-W${String(Number(reportWeek) || 0).padStart(2, "0")}`;
}

function weekLabel(referenceDate, reportWeek) {
  return `${isoWeekYear(referenceDate)}年第${Number(reportWeek) || 0}周`;
}

function monthLabel(month) {
  const [y, m] = String(month).split("-");
  return `${y}年${Number(m)}月`;
}

function parseRows(name) {
  const path = join(DATA, name);
  if (!existsSync(path)) return { header: [], rows: [] };
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return { header: [], rows: [] };
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
  return { header, rows };
}

function sentinelPeriod(rows) {
  let latest = null;
  const dates = new Set();
  for (const row of rows) {
    const date = row.reference_date;
    if (!date) continue;
    dates.add(date);
    if (!latest || date > latest.reference_date) {
      latest = {
        latest_key: weekKey(date, row.report_week),
        latest_label: weekLabel(date, row.report_week),
        reference_date: date,
        target_end_date: row.target_end_date,
        report_week: Number(row.report_week) || 0,
      };
    }
  }
  return { ...latest, weeks: dates.size, rows: rows.length };
}

function notifiablePeriod(rows) {
  let latest = null;
  const months = new Set();
  for (const row of rows) {
    const month = row.month;
    if (!month) continue;
    months.add(month);
    if (!latest || month > latest.latest_month) {
      latest = { latest_month: month, latest_label: monthLabel(month) };
    }
  }
  return { ...latest, months: months.size, rows: rows.length };
}

function variantPeriod(rows) {
  let latest = null;
  const weeks = new Set();
  for (const row of rows) {
    const start = row.week_start || row.reference_date;
    if (!start) continue;
    weeks.add(start);
    if (!latest || start > latest.week_start) {
      latest = {
        latest_key: weekKey(start, row.week),
        latest_label: weekLabel(start, row.week),
        week_start: start,
        year: Number(row.year) || isoWeekYear(start),
        week: Number(row.week) || 0,
      };
    }
  }
  return { ...latest, weeks: weeks.size, rows: rows.length };
}

export function readCatalog() {
  if (!existsSync(CATALOG_PATH)) return null;
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function periodChanged(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  const prevKey = prev.latest_key ?? prev.latest_month ?? null;
  const nextKey = next.latest_key ?? next.latest_month ?? null;
  return (
    prevKey !== nextKey ||
    prev.rows !== next.rows ||
    prev.weeks !== next.weeks ||
    prev.months !== next.months
  );
}

function attachCrawl(name, period, previous, crawl, syncedAt) {
  const prev = previous?.[name];
  const overlay = crawl[name] ?? {};
  const changed = periodChanged(prev, period);
  return {
    ...period,
    crawl: overlay.crawl ?? "ok",
    error: overlay.error ?? null,
    unchanged: !changed,
    synced_at: changed ? syncedAt : (prev?.synced_at ?? null),
  };
}

export function catalogHasNewPeriods(catalog) {
  return ["sentinel", "notifiable", "covid_variants", "covid_positivity"].some(
    (name) => catalog[name] && catalog[name].unchanged === false,
  );
}

export function buildCatalog({
  syncedAt = new Date().toISOString(),
  previous = null,
  crawl = {},
} = {}) {
  const sentinel = parseRows("cncdc_surveillance_all.csv");
  const notifiable = parseRows("notifiable_all.csv");
  const variants = parseRows("covid_variants.csv");
  const covid = parseRows("cncdc_surveillance_covid19.csv");
  const datasets = {
    sentinel: attachCrawl("sentinel", sentinelPeriod(sentinel.rows), previous, crawl, syncedAt),
    notifiable: attachCrawl("notifiable", notifiablePeriod(notifiable.rows), previous, crawl, syncedAt),
    covid_variants: attachCrawl(
      "covid_variants",
      variantPeriod(variants.rows),
      previous,
      crawl,
      syncedAt,
    ),
    covid_positivity: attachCrawl(
      "covid_positivity",
      sentinelPeriod(covid.rows),
      previous,
      crawl,
      syncedAt,
    ),
  };
  const anyChanged = Object.values(datasets).some((section) => !section.unchanged);
  return {
    synced_at: anyChanged ? syncedAt : (previous?.synced_at ?? syncedAt),
    source: {
      sentinel: "https://www.chinacdc.cn/jksj/jksj04_14275/",
      notifiable: "https://www.chinacdc.cn/jksj/jksj01/",
      covid_variants: "https://www.chinacdc.cn/jksj/xgbdyq/",
      covid_positivity: "https://www.chinacdc.cn/jksj/jksj04_14275/",
    },
    ...datasets,
  };
}

export function writeCatalog(catalog) {
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

export function summarize(catalog) {
  return [
    catalog.sentinel?.latest_key,
    catalog.notifiable?.latest_month,
    catalog.covid_positivity?.latest_key,
  ]
    .filter(Boolean)
    .join(" / ");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const catalog = writeCatalog(buildCatalog({ previous: readCatalog() }));
  console.log("catalog", summarize(catalog));
}
