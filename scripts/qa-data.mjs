#!/usr/bin/env node
/**
 * Apply known CDC-table corrections and catch the two recurring extract bugs:
 *  - sentinel: a single week ~10× both neighbors (OCR dropped the decimal)
 *  - notifiable: spaced digit groups ("10 84") and totals that do not add up
 *
 * Safe to re-run. Explicit patches only fire when the cell still equals `from`,
 * so an upstream fix is left alone.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseNumber, writeOutputs } from "./sync-notifiable.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CORR = join(DATA, "corrections");

const SURV_FIELDS = ["ili_percent", "sari_percent"];

export function oneDecimal(n) {
  return Math.round(n * 10) / 10;
}

export function daysBetween(a, b) {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

/** If value/10 sits between both neighbors, it is the OCR 9.4→94 pattern. */
export function decimalShiftCorrection(value, prev, next) {
  if (value == null || prev == null || next == null) return null;
  if (value < 10) return null;
  const candidate = oneDecimal(value / 10);
  const lo = Math.min(prev, next) - 1;
  const hi = Math.max(prev, next) + 1;
  if (candidate < lo || candidate > hi) return null;
  if (Math.abs(value - prev) < 8 && Math.abs(value - next) < 8) return null;
  return candidate;
}

function loadJson(name) {
  return JSON.parse(readFileSync(join(CORR, name), "utf8"));
}

export function parseSurveillanceCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    for (const f of SURV_FIELDS) {
      const n = Number(row[f]);
      row[f] = Number.isFinite(n) && row[f] !== "" ? n : null;
    }
    rows.push(row);
  }
  return { header, rows };
}

export function formatSurveillanceCsv(header, rows) {
  const body = rows.map((r) =>
    header
      .map((h) => {
        const v = r[h];
        if (SURV_FIELDS.includes(h)) return v == null ? "" : v.toFixed(1);
        return v ?? "";
      })
      .join(","),
  );
  return [header.join(","), ...body].join("\n") + "\n";
}

function sameValue(a, b) {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

export function applyExplicitSurveillance(rows, patches) {
  const applied = [];
  for (const p of patches) {
    const row = rows.find((r) => r.reference_date === p.reference_date && r.pathogen === p.pathogen);
    if (!row) continue;
    const current = row[p.field];
    if (sameValue(current, p.to)) continue;
    if (p.from !== undefined && !sameValue(current, p.from)) continue;
    row[p.field] = typeof p.to === "number" ? oneDecimal(p.to) : p.to;
    applied.push({
      kind: "explicit",
      reference_date: p.reference_date,
      pathogen: p.pathogen,
      field: p.field,
      from: current,
      to: row[p.field],
      reason: p.reason,
    });
  }
  return applied;
}

export function upsertOfficialWeeks(rows, official) {
  const keyOf = (r) => `${r.reference_date}|${r.pathogen}`;
  const index = new Map(rows.map((r, i) => [keyOf(r), i]));
  const applied = [];
  const toInsert = [];
  const fields = ["target_end_date", "report_week", "ili_percent", "sari_percent"];
  for (const g of official) {
    const k = keyOf(g);
    if (index.has(k)) {
      const row = rows[index.get(k)];
      for (const field of fields) {
        if (sameValue(row[field], g[field])) continue;
        const from = row[field];
        row[field] = g[field];
        applied.push({
          kind: "official-week",
          reference_date: g.reference_date,
          pathogen: g.pathogen,
          field,
          from,
          to: row[field],
          reason: "官方月报周序列回补",
        });
      }
    } else {
      toInsert.push({
        reference_date: g.reference_date,
        target_end_date: g.target_end_date,
        report_week: g.report_week,
        pathogen: g.pathogen,
        ili_percent: g.ili_percent,
        sari_percent: g.sari_percent,
      });
      applied.push({
        kind: "official-week",
        reference_date: g.reference_date,
        pathogen: g.pathogen,
        field: "row",
        from: null,
        to: "insert",
        reason: "官方月报补入主表缺失周",
      });
    }
  }
  const byDate = new Map();
  for (const row of toInsert) {
    if (!byDate.has(row.reference_date)) byDate.set(row.reference_date, []);
    byDate.get(row.reference_date).push(row);
  }
  for (const date of [...byDate.keys()].sort((a, b) => b.localeCompare(a))) {
    const block = byDate.get(date).sort((a, b) => a.pathogen.localeCompare(b.pathogen, "zh"));
    let pos = rows.findIndex((r) => r.reference_date < date);
    if (pos < 0) pos = rows.length;
    rows.splice(pos, 0, ...block);
  }
  return applied;
}

export function overlayGapCovid(rows, gapRows) {
  const applied = [];
  for (const g of gapRows) {
    const row = rows.find((r) => r.reference_date === g.reference_date && r.pathogen === g.pathogen);
    if (!row) continue;
    for (const field of ["target_end_date", "ili_percent", "sari_percent"]) {
      if (sameValue(row[field], g[field])) continue;
      const from = row[field];
      row[field] = g[field];
      applied.push({
        kind: "gap-overlay",
        reference_date: g.reference_date,
        pathogen: g.pathogen,
        field,
        from,
        to: row[field],
        reason: "W14–W22 月报缺口文件（与官方月报表1一致）",
      });
    }
  }
  return applied;
}

export function applyDecimalShiftHeuristic(rows) {
  const applied = [];
  const byPathogen = new Map();
  for (const row of rows) {
    if (!byPathogen.has(row.pathogen)) byPathogen.set(row.pathogen, []);
    byPathogen.get(row.pathogen).push(row);
  }
  for (const series of byPathogen.values()) {
    series.sort((a, b) => a.reference_date.localeCompare(b.reference_date));
    for (let i = 1; i < series.length - 1; i++) {
      const prev = series[i - 1];
      const cur = series[i];
      const next = series[i + 1];
      if (daysBetween(prev.reference_date, cur.reference_date) !== 7) continue;
      if (daysBetween(cur.reference_date, next.reference_date) !== 7) continue;
      for (const field of SURV_FIELDS) {
        const to = decimalShiftCorrection(cur[field], prev[field], next[field]);
        if (to == null) continue;
        const from = cur[field];
        cur[field] = to;
        applied.push({
          kind: "decimal-shift",
          reference_date: cur.reference_date,
          pathogen: cur.pathogen,
          field,
          from,
          to,
          reason: `单周 ${from} 约为邻周 ${prev[field]} / ${next[field]} 的 10 倍`,
        });
      }
    }
  }
  return applied;
}

export function applyNotifiablePatches(records, patches) {
  const applied = [];
  for (const p of patches) {
    const row = records.find((r) => r.month === p.month && r.disease === p.disease);
    if (!row) continue;
    const current = row[p.field];
    if (sameValue(current, p.to)) continue;
    if (p.from !== undefined && !sameValue(current, p.from)) continue;
    row[p.field] = p.to;
    applied.push({
      kind: "explicit",
      month: p.month,
      disease: p.disease,
      field: p.field,
      from: current,
      to: p.to,
      reason: p.reason,
    });
  }
  return applied;
}

function parseNotifiableCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    row.cases = Number(row.cases) || 0;
    row.deaths = Number(row.deaths) || 0;
    rows.push(row);
  }
  return rows;
}

function isoWeekYear(referenceDate) {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 3);
  return date.getUTCFullYear();
}

export function rebuildSnapshots(allText) {
  const snap = join(DATA, "snapshots");
  mkdirSync(snap, { recursive: true });
  const lines = allText.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0];
  const cols = header.split(",");
  const iDate = cols.indexOf("reference_date");
  const iWeek = cols.indexOf("report_week");
  const groups = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const date = parts[iDate];
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(line);
  }
  let n = 0;
  for (const [date, rows] of groups) {
    const week = String(Number(rows[0].split(",")[iWeek]) || 0).padStart(2, "0");
    const year = isoWeekYear(date);
    writeFileSync(join(snap, `${year}-W${week}.csv`), [header, ...rows].join("\n") + "\n");
    n += 1;
  }
  return n;
}

export function applySurveillanceFileFixes() {
  const patches = loadJson("surveillance.json");
  const all = parseSurveillanceCsv(readFileSync(join(DATA, "cncdc_surveillance_all.csv"), "utf8"));
  const gap = parseSurveillanceCsv(readFileSync(join(DATA, "cncdc_suverillance_2025_14_22.csv"), "utf8"));
  const official = parseSurveillanceCsv(readFileSync(join(CORR, "sentinel-monthly-gap.csv"), "utf8"));
  const applied = [
    ...applyExplicitSurveillance(all.rows, patches),
    ...upsertOfficialWeeks(all.rows, official.rows),
    ...overlayGapCovid(all.rows, gap.rows),
    ...applyDecimalShiftHeuristic(all.rows),
  ];
  const allText = formatSurveillanceCsv(all.header, all.rows);
  writeFileSync(join(DATA, "cncdc_surveillance_all.csv"), allText);
  mergeCovidLongSeries(all.rows);
  return { applied, allText };
}

/** Keep 2022–2024 COVID-only weeks; 11-pathogen overlap prefers the main table. */
export function mergeCovidLongSeries(allRows) {
  const header = ["reference_date", "target_end_date", "report_week", "pathogen", "ili_percent", "sari_percent"];
  const map = new Map();
  const existingPath = join(DATA, "cncdc_surveillance_covid19.csv");
  if (existsSync(existingPath)) {
    for (const row of parseSurveillanceCsv(readFileSync(existingPath, "utf8")).rows) {
      if (row.reference_date) map.set(row.reference_date, { ...row, pathogen: "新型冠状病毒" });
    }
  }
  for (const row of allRows.filter((r) => r.pathogen === "新型冠状病毒")) {
    map.set(row.reference_date, {
      reference_date: row.reference_date,
      target_end_date: row.target_end_date,
      report_week: row.report_week,
      pathogen: "新型冠状病毒",
      ili_percent: row.ili_percent,
      sari_percent: row.sari_percent,
    });
  }
  const rows = [...map.values()].sort((a, b) => b.reference_date.localeCompare(a.reference_date));
  writeFileSync(join(DATA, "cncdc_surveillance_covid19.csv"), formatSurveillanceCsv(header, rows));
  return rows.length;
}

export function applyNotifiableFileFixes() {
  const records = parseNotifiableCsv(readFileSync(join(DATA, "notifiable_all.csv"), "utf8"));
  const before = records.map((r) => ({ ...r }));
  writeOutputs(records);
  const applied = [];
  for (let i = 0; i < records.length; i++) {
    for (const field of ["cases", "deaths"]) {
      if (records[i][field] !== before[i][field]) {
        applied.push({
          kind: "notifiable",
          month: records[i].month,
          disease: records[i].disease,
          field,
          from: before[i][field],
          to: records[i][field],
        });
      }
    }
  }
  return { applied };
}

function selftest() {
  const cases = [
    [parseNumber("10 84"), 1084, "spaced 1084"],
    [parseNumber("1 701"), 1701, "spaced 1701"],
    [parseNumber("16 91"), 1691, "spaced 1691"],
    [parseNumber("1,084"), 1084, "comma 1084"],
    [decimalShiftCorrection(94, 10.9, 9.7), 9.4, "rhino 94"],
    [decimalShiftCorrection(75, 9.7, 6.9), 7.5, "rhino 75"],
    [decimalShiftCorrection(45, 3.8, 3.7), 4.5, "adeno 45"],
    [decimalShiftCorrection(29.8, 17.5, 38.1), null, "real flu jump"],
    [decimalShiftCorrection(11.1, 2.3, null), null, "need both neighbors"],
  ];
  for (const [got, want, name] of cases) {
    if (got !== want) throw new Error(`selftest ${name}: got ${got}, want ${want}`);
  }
}

export function runQa({ surveillance = true, notifiable = true } = {}) {
  selftest();
  const report = { surveillance: [], notifiable: [] };
  if (surveillance) {
    const { applied, allText } = applySurveillanceFileFixes();
    rebuildSnapshots(allText);
    report.surveillance = applied;
  }
  if (notifiable) {
    report.notifiable = applyNotifiableFileFixes().applied;
  }
  return report;
}

function printReport(report) {
  const n = report.surveillance.length + report.notifiable.length;
  console.log(`qa-data applied ${n} cell fixes`);
  for (const row of report.surveillance) {
    console.log(
      "  surv",
      row.kind,
      row.reference_date,
      row.pathogen,
      row.field,
      `${row.from} -> ${row.to}`,
    );
  }
  for (const row of report.notifiable) {
    console.log("  nid", row.kind, row.month, row.disease, row.field, `${row.from} -> ${row.to}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  printReport(runQa());
  const { writeCatalog, summarize, buildCatalog, readCatalog } = await import("./catalog.mjs");
  console.log("catalog", summarize(writeCatalog(buildCatalog({ previous: readCatalog() }))));
}
