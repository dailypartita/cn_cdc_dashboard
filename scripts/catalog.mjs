/**
 * Snapshot of the latest period in each committed CSV.
 * Homepage / CSV / API dates are derived from the CSVs themselves;
 * this file is the ingest receipt (commit messages, /api/v1/status).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cnicCoverage } from "./cnic-weekly.mjs";
import { seriesCoverage } from "./notifiable-backfill.mjs";

const FLU_DEFINITION_NOTE =
  "2013年11月起甲型H1N1流感并入丙类流行性感冒，此前单独列报，未加进本列。2009年3月前仅有的散点月份未收录。来源把2010年11月误标成第二个2010-10，已按该月公报总计改回2010-11。";

const CNIC_NOTE =
  "国家流感中心周报的哨点医院 ILI%（占门急诊）和 ILI 标本流感检测阳性率。不是多病原哨点「流感病毒」核酸阳性率，也不是法定传染病月报发病数。内科与儿内科分开报告的早期 ILI% 没有并入。与 Zenodo 10.5281/zenodo.22784835 重叠的字段以中国流感中心页面或 PDF 为准。";

const COVID_HISTORY_NOTE =
  "门急诊 ILI 新冠核酸阳性率自 2022-W49 起。没有找到更早的同一口径周序列，未并入 2020–2022 年每日确诊数。";

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
  const flu = seriesCoverage(rows, "流行性感冒");
  return {
    ...latest,
    months: months.size,
    rows: rows.length,
    series: {
      登革热: seriesCoverage(rows, "登革热"),
      流行性感冒: flu ? { ...flu, definition_note: FLU_DEFINITION_NOTE } : null,
    },
  };
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

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cnicPeriod(rows) {
  let latest = null;
  for (const row of rows) {
    const date = row.reference_date;
    if (!date) continue;
    if (!latest || date > latest.reference_date) {
      latest = {
        latest_key: weekKey(date, row.week),
        latest_label: weekLabel(date, row.week),
        reference_date: date,
        target_end_date: row.target_end_date,
        report_week: Number(row.week) || 0,
      };
    }
  }
  const coverage = cnicCoverage(
    rows.map((row) => ({
      ...row,
      year: Number(row.year) || isoWeekYear(row.reference_date),
      week: Number(row.week) || 0,
      ili_south: optionalNumber(row.ili_south),
      ili_north: optionalNumber(row.ili_north),
      positivity_south: optionalNumber(row.positivity_south),
      positivity_north: optionalNumber(row.positivity_north),
      positivity_national: optionalNumber(row.positivity_national),
    })),
  );
  return {
    ...latest,
    weeks: coverage.rows,
    rows: rows.length,
    ili: coverage.ili,
    positivity: coverage.positivity,
    definition_note: CNIC_NOTE,
  };
}

export function catalogHasNewPeriods(catalog) {
  return ["sentinel", "notifiable", "covid_variants", "covid_positivity", "cnic"].some(
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
  const cnic = parseRows("cnic_influenza_weekly.csv");
  const datasets = {
    sentinel: attachCrawl("sentinel", sentinelPeriod(sentinel.rows), previous, crawl, syncedAt),
    notifiable: attachCrawl("notifiable", notifiablePeriod(notifiable.rows), previous, crawl, syncedAt),
    cnic: attachCrawl("cnic", cnicPeriod(cnic.rows), previous, crawl, syncedAt),
    covid_variants: attachCrawl(
      "covid_variants",
      variantPeriod(variants.rows),
      previous,
      crawl,
      syncedAt,
    ),
    covid_positivity: {
      ...attachCrawl("covid_positivity", sentinelPeriod(covid.rows), previous, crawl, syncedAt),
      history_note: COVID_HISTORY_NOTE,
    },
  };
  const anyChanged = Object.values(datasets).some((section) => !section.unchanged);
  return {
    synced_at: anyChanged ? syncedAt : (previous?.synced_at ?? syncedAt),
    source: {
      sentinel: "https://www.chinacdc.cn/jksj/jksj04_14275/",
      notifiable: "https://www.chinacdc.cn/jksj/jksj01/",
      notifiable_historical: "https://github.com/stone-zeng/china-infectious-diseases",
      covid_variants: "https://www.chinacdc.cn/jksj/xgbdyq/",
      covid_positivity: "https://www.chinacdc.cn/jksj/jksj04_14275/",
      cnic: "https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/",
      cnic_archive: "https://ivdc.chinacdc.cn/lgzx/zyzx/lgzb/",
      cnic_zenodo: "https://doi.org/10.5281/zenodo.22784835",
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
