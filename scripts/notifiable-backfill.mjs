/**
 * Historical 登革热 / 流行性感冒 monthly rows compiled from
 * https://github.com/stone-zeng/china-infectious-diseases (CC0).
 *
 * The committed extract is data/backfill/notifiable-flu-dengue.csv.
 * Official China CDC rows win on (month, disease). sync-notifiable's
 * writeOutputs merges this file back in, so the next CDC crawl does not
 * drop the history. Months the source leaves blank are omitted, not filled
 * with zero.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NOTIFIABLE_CSV = join(ROOT, "data", "notifiable_all.csv");
export const BACKFILL_CSV = join(ROOT, "data", "backfill", "notifiable-flu-dengue.csv");
export const BACKFILL_META = join(ROOT, "data", "backfill", "notifiable-flu-dengue.json");

export const STONE_ZENG_REPO = "https://github.com/stone-zeng/china-infectious-diseases";
export const STONE_ZENG_CASES_URL = `${STONE_ZENG_REPO}/blob/main/data/monthly-cases.csv`;

const TOTAL_COLUMN = "甲乙丙类传染病总计";

/** Hosts used on compiled rows. Official CDC rows use chinacdc.cn and stay put. */
const BACKFILL_HOSTS = ["nhc.gov.cn", "ndcpa.gov.cn", "kns.cnki.net", "github.com/stone-zeng"];

export const BACKFILL_DISEASES = [
  { disease: "登革热", disease_class: "乙类", continuous_from: "2004-01" },
  { disease: "流行性感冒", disease_class: "丙类", continuous_from: "2009-03" },
];

const HEADER =
  "reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,cases,deaths,source_url";

export function parseCount(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/,/g, "").replace(/[\s\u00a0\u3000]+/g, "");
  if (!text || text === "-" || text === "—" || text === "–") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function calendarMonths(start, end) {
  const out = [];
  let year = Number(String(start).slice(0, 4));
  let month = Number(String(start).slice(5, 7));
  const endYear = Number(String(end).slice(0, 4));
  const endMonth = Number(String(end).slice(5, 7));
  if (!year || !month || !endYear || !endMonth) return out;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export function monthAfter(month) {
  let year = Number(month.slice(0, 4));
  let m = Number(month.slice(5, 7)) + 1;
  if (m === 13) {
    m = 1;
    year += 1;
  }
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

export function monthBefore(month) {
  let year = Number(month.slice(0, 4));
  let m = Number(month.slice(5, 7)) - 1;
  if (m === 0) {
    m = 12;
    year -= 1;
  }
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

export function monthRange(month) {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return {
    reference_date: `${month}-01`,
    target_end_date: last.toISOString().slice(0, 10),
  };
}

function csvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cols) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = cols[index] ?? "";
    });
    return record;
  });
}

export function parseNotifiableCsv(text) {
  return parseCsv(text)
    .map((row) => ({
      month: String(row.month ?? "").trim(),
      report_date: String(row.report_date ?? "").trim(),
      disease: String(row.disease ?? "").trim(),
      disease_class: String(row.disease_class ?? "").trim(),
      row_kind: String(row.row_kind ?? "").trim() || "disease",
      cases: parseCount(row.cases),
      deaths: parseCount(row.deaths),
      source_url: String(row.source_url ?? "").trim(),
    }))
    .filter((row) => row.month && row.disease);
}

export function recordsToCsv(records) {
  const body = records.map((row) => {
    const range = monthRange(row.month);
    return [
      range.reference_date,
      range.target_end_date,
      row.month,
      row.report_date ?? "",
      row.disease,
      row.disease_class,
      row.row_kind || "disease",
      row.cases == null ? "" : String(row.cases),
      row.deaths == null ? "" : String(row.deaths),
      row.source_url ?? "",
    ]
      .map(csvField)
      .join(",");
  });
  return [HEADER, ...body].join("\n") + "\n";
}

export function parseUpstreamLinks(readme) {
  const section = String(readme ?? "").split("### 月度数据")[1] ?? "";
  const links = new Map();
  const yearRe = /<samp>(20\d{2})<\/samp>:([\s\S]*?)(?=<samp>20\d{2}<\/samp>:|$)/g;
  for (const yearMatch of section.matchAll(yearRe)) {
    const year = yearMatch[1];
    const monthRe = /<samp>(\d{2})<\/samp>\]\(([^)\s]+)\)/g;
    for (const monthMatch of yearMatch[2].matchAll(monthRe)) {
      const href = new URL(monthMatch[2], "https://www.nhc.gov.cn").href;
      links.set(`${year}-${monthMatch[1]}`, href);
    }
  }
  return links;
}

function duplicateMonthLabels(rows) {
  const counts = new Map();
  for (const row of rows) {
    const month = String(row["月份"] ?? "").trim();
    if (!month) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([month]) => month);
}

/**
 * stone-zeng labels the 2010-11 bulletin as a second 2010-10.
 * October is the row whose national total is 509523 cases and 1254 deaths.
 * November is 527762 cases and 1547 deaths. Any other duplicate month is
 * dropped instead of guessed.
 */
export function separateMislabeledMonths(caseRows, deathRows) {
  const cases = caseRows.map((row) => ({ ...row }));
  const deaths = deathRows.map((row) => ({ ...row }));
  const relabeled = [];
  const caseDup = cases
    .map((row, index) => (String(row["月份"] ?? "").trim() === "2010-10" ? index : -1))
    .filter((index) => index >= 0);
  const deathDup = deaths
    .map((row, index) => (String(row["月份"] ?? "").trim() === "2010-10" ? index : -1))
    .filter((index) => index >= 0);
  const novemberTaken =
    cases.some((row) => String(row["月份"] ?? "").trim() === "2010-11") ||
    deaths.some((row) => String(row["月份"] ?? "").trim() === "2010-11");
  if (caseDup.length === 2 && deathDup.length === 2 && !novemberTaken) {
    const october =
      cases[caseDup[0]][TOTAL_COLUMN] === "509523" && deaths[deathDup[0]][TOTAL_COLUMN] === "1254";
    const november =
      cases[caseDup[1]][TOTAL_COLUMN] === "527762" && deaths[deathDup[1]][TOTAL_COLUMN] === "1547";
    if (october && november) {
      cases[caseDup[1]]["月份"] = "2010-11";
      deaths[deathDup[1]]["月份"] = "2010-11";
      relabeled.push({
        labeled_as: "2010-10",
        month: "2010-11",
        cases_total: "527762",
        deaths_total: "1547",
      });
    }
  }
  const unresolved = [...new Set([...duplicateMonthLabels(cases), ...duplicateMonthLabels(deaths)])].sort();
  const skip = new Set(unresolved);
  return {
    caseRows: cases.filter((row) => !skip.has(String(row["月份"] ?? "").trim())),
    deathRows: deaths.filter((row) => !skip.has(String(row["月份"] ?? "").trim())),
    relabeled,
    unresolved,
  };
}

export function isCompiledBackfillRow(row) {
  if (row?.disease !== "登革热" && row?.disease !== "流行性感冒") return false;
  const url = String(row.source_url ?? "");
  return BACKFILL_HOSTS.some((host) => url.includes(host));
}

export function officialCoverageStart(records) {
  const months = records
    .filter((row) => row.month && !isCompiledBackfillRow(row))
    .map((row) => row.month)
    .sort();
  return months[0] ?? "";
}

function diseaseSpec(name) {
  return BACKFILL_DISEASES.find((spec) => spec.disease === name);
}

/**
 * Wide stone-zeng month rows → long notifiable rows.
 * `beforeMonth` is the first official CDC month; those months are left out.
 * A blank cases cell is a missing month. A blank deaths cell stays null.
 */
export function buildHistoricalRows({ caseRows, deathRows, links, beforeMonth }) {
  const deathsByMonth = new Map(deathRows.map((row) => [row["月份"], row]));
  const out = [];
  for (const row of caseRows) {
    const month = String(row["月份"] ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (beforeMonth && month >= beforeMonth) continue;
    const deathRow = deathsByMonth.get(month);
    for (const spec of BACKFILL_DISEASES) {
      if (month < spec.continuous_from) continue;
      const cases = parseCount(row[spec.disease]);
      if (cases == null) continue;
      const source = links?.get(month) || STONE_ZENG_CASES_URL;
      out.push({
        month,
        report_date: "",
        disease: spec.disease,
        disease_class: spec.disease_class,
        row_kind: "disease",
        cases,
        deaths: parseCount(deathRow?.[spec.disease]),
        source_url: source,
      });
    }
  }
  out.sort((a, b) => a.month.localeCompare(b.month) || a.disease.localeCompare(b.disease, "zh"));
  return out;
}

/** Influenza cases before the continuous series. Not written into the table. */
export function omittedSparseInfluenza(caseRows, deathRows) {
  const deathsByMonth = new Map(deathRows.map((row) => [row["月份"], row]));
  const flu = diseaseSpec("流行性感冒");
  const out = [];
  for (const row of caseRows) {
    const month = String(row["月份"] ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month) || month >= flu.continuous_from) continue;
    const cases = parseCount(row["流行性感冒"]);
    if (cases == null) continue;
    out.push({
      month,
      cases,
      deaths: parseCount(deathsByMonth.get(month)?.["流行性感冒"]),
    });
  }
  return out;
}

export function missingSourceMonths(caseRows) {
  const months = caseRows.map((row) => String(row["月份"] ?? "").trim()).filter((month) => /^\d{4}-\d{2}$/.test(month));
  if (!months.length) return [];
  const sorted = [...months].sort();
  const present = new Set(sorted);
  return calendarMonths(sorted[0], sorted[sorted.length - 1]).filter((month) => !present.has(month));
}

export function overlapMismatches(caseRows, deathRows, officialRows) {
  const cases = new Map(caseRows.map((row) => [row["月份"], row]));
  const deaths = new Map(deathRows.map((row) => [row["月份"], row]));
  const mismatches = [];
  for (const row of officialRows) {
    if (!diseaseSpec(row.disease)) continue;
    const stoneCases = parseCount(cases.get(row.month)?.[row.disease]);
    if (stoneCases == null) continue;
    const stoneDeaths = parseCount(deaths.get(row.month)?.[row.disease]);
    const officialCases = parseCount(row.cases);
    const officialDeaths = parseCount(row.deaths);
    if (stoneCases !== officialCases || (stoneDeaths != null && stoneDeaths !== officialDeaths)) {
      mismatches.push({
        month: row.month,
        disease: row.disease,
        stone_cases: stoneCases,
        stone_deaths: stoneDeaths,
        official_cases: officialCases,
        official_deaths: officialDeaths,
      });
    }
  }
  return mismatches;
}

/**
 * Append compiled rows whose (month, disease) is not already present.
 * Existing rows — including every official CDC value — are left as they are.
 */
export function mergeNotifiableBackfill(records, historical = loadNotifiableBackfill()) {
  const keys = new Set(records.map((row) => `${row.month}|${row.disease}`));
  for (const row of historical) {
    if (!diseaseSpec(row.disease)) continue;
    const key = `${row.month}|${row.disease}`;
    if (keys.has(key)) continue;
    keys.add(key);
    records.push({ ...row, row_kind: row.row_kind || "disease" });
  }
  records.sort((a, b) => a.month.localeCompare(b.month) || a.disease.localeCompare(b.disease, "zh"));
  return records;
}

export function loadNotifiableBackfill() {
  if (!existsSync(BACKFILL_CSV)) return [];
  return parseNotifiableCsv(readFileSync(BACKFILL_CSV, "utf8"));
}

function groupGaps(missing) {
  if (!missing.length) return [];
  const groups = [];
  let start = missing[0];
  let prev = missing[0];
  let count = 1;
  for (const month of missing.slice(1)) {
    if (month === monthAfter(prev)) {
      prev = month;
      count += 1;
    } else {
      groups.push({ start, end: prev, count });
      start = month;
      prev = month;
      count = 1;
    }
  }
  groups.push({ start, end: prev, count });
  return groups;
}

export function seriesCoverage(rows, disease) {
  const subset = rows.filter((row) => row.disease === disease && row.month);
  if (!subset.length) return null;
  const months = [...new Set(subset.map((row) => row.month))].sort();
  const present = new Set(months);
  const missing = calendarMonths(months[0], months[months.length - 1]).filter((month) => !present.has(month));
  const groups = groupGaps(missing);
  let continuousFrom = months[0];
  for (const group of groups) {
    if (group.count > 1) continuousFrom = monthAfter(group.end);
  }
  const deathsMissing = [...new Set(subset.filter((row) => parseCount(row.deaths) == null).map((row) => row.month))].sort();
  const coverage = {
    first_month: months[0],
    last_month: months[months.length - 1],
    months: months.length,
    continuous_from: continuousFrom,
    gaps: groups.map((group) => (group.start === group.end ? group.start : `${group.start}/${group.end}`)),
  };
  if (deathsMissing.length) coverage.deaths_missing = deathsMissing;
  return coverage;
}
