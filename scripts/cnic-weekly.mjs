/**
 * Chinese National Influenza Centre (CNIC) weekly ILI% and specimen
 * positivity. This is not the 11-pathogen sentinel "流感病毒" series and
 * not the monthly notifiable case counts.
 *
 * Official report text wins field by field. Zenodo 10.5281/zenodo.22784835
 * (CC BY 4.0, Zhao 2026) only fills blanks. A later sync that sees only
 * recent weeks must not drop older rows: assembleCnicRows starts from the
 * committed backfill and ignores nulls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CNIC_CSV = join(ROOT, "data", "cnic_influenza_weekly.csv");
export const CNIC_BACKFILL_CSV = join(ROOT, "data", "backfill", "cnic-influenza-weekly.csv");
export const CNIC_BACKFILL_META = join(ROOT, "data", "backfill", "cnic-influenza-weekly.json");

export const CNIC_LISTING = "https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/";
export const CNIC_ARCHIVE = "https://ivdc.chinacdc.cn/lgzx/zyzx/lgzb/";
export const ZENODO_RECORD = "https://doi.org/10.5281/zenodo.22784835";
export const ZENODO_EXTRACT = "zenodo-22784835";

export const CNIC_COLUMNS = [
  "reference_date",
  "target_end_date",
  "year",
  "week",
  "ili_south",
  "ili_north",
  "positivity_south",
  "positivity_north",
  "positivity_national",
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
  "source_url",
  "publish_date",
  "ili_extract",
  "lab_extract",
];

export const ILI_FIELDS = ["ili_south", "ili_north"];
export const LAB_FIELDS = CNIC_COLUMNS.filter(
  (name) => !["reference_date", "target_end_date", "year", "week", "source_url", "publish_date", "ili_extract", "lab_extract"].includes(name) && !ILI_FIELDS.includes(name),
);
const NUMERIC = [...ILI_FIELDS, ...LAB_FIELDS];

const SIGNAL = [
  "ili_south",
  "ili_north",
  "positivity_south",
  "positivity_north",
  "positivity_national",
  "tests_national",
  "positives_national",
  "positives_south",
  "positives_north",
  "h1_national",
  "h3_national",
  "bvic_national",
];

const SUBTYPE_ORDER = [
  ["a_unsub", /unsubtyped|未分型|A未分/],
  ["b_untyped", /未分系/],
  ["bvic", /Victoria/i],
  ["byam", /Yamagata/i],
  ["h3", /H3N2|H3/],
  ["h1", /pdm09/],
  ["skip", /季节性.*H1N1|H1N1.*季节性/],
  ["h1", /甲型\(H1N1\)|甲型H1N1/],
  ["a", /^A型$/],
  ["b", /^B型$/],
];

export function isoWeekRange(year, week) {
  const y = Number(year);
  const w = Number(week);
  if (!y || !w) return { reference_date: "", target_end_date: "" };
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (date) => date.toISOString().slice(0, 10);
  return { reference_date: fmt(monday), target_end_date: fmt(sunday) };
}

export function isoWeekYearFromDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 3);
  return date.getUTCFullYear();
}

export function isoWeekNumberFromDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((date - yearStart) / 86400000 / 7 + 1 / 7);
}

export function weekKeyOf(year, week) {
  return `${Number(year)}-W${String(Number(week)).padStart(2, "0")}`;
}

export function blankCnicRow(meta = {}) {
  const year = Number(meta.year) || 0;
  const week = Number(meta.week) || 0;
  const range = isoWeekRange(year, week);
  const row = {
    reference_date: meta.reference_date || range.reference_date,
    target_end_date: meta.target_end_date || range.target_end_date,
    year,
    week,
    source_url: meta.source_url || "",
    publish_date: meta.publish_date || "",
    ili_extract: "",
    lab_extract: "",
  };
  for (const name of NUMERIC) row[name] = null;
  return row;
}

function csvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatNum(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
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
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += ch;
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

export function parseCnicCsv(text) {
  return parseCsv(text)
    .map((row) => {
      const record = blankCnicRow({
        year: row.year,
        week: row.week,
        reference_date: String(row.reference_date ?? "").trim(),
        target_end_date: String(row.target_end_date ?? "").trim(),
        source_url: String(row.source_url ?? "").trim(),
        publish_date: String(row.publish_date ?? "").trim(),
      });
      record.ili_extract = String(row.ili_extract ?? "").trim();
      record.lab_extract = String(row.lab_extract ?? "").trim();
      for (const name of NUMERIC) {
        const raw = String(row[name] ?? "").trim();
        if (!raw) continue;
        const n = Number(raw);
        record[name] = Number.isFinite(n) ? n : null;
      }
      return record;
    })
    .filter((row) => row.year && row.week && row.reference_date);
}

export function recordsToCsv(records) {
  const body = records.map((row) => CNIC_COLUMNS.map((name) => csvField(NUMERIC.includes(name) ? formatNum(row[name]) : row[name] ?? "")).join(","));
  return [CNIC_COLUMNS.join(","), ...body].join("\n") + "\n";
}

export function hasSignal(row) {
  return SIGNAL.some((name) => row?.[name] != null);
}

function cloneRow(row) {
  return { ...row };
}

function joinExtract(a, b) {
  const parts = [];
  for (const tag of `${a || ""}+${b || ""}`.split("+")) {
    if (tag && !parts.includes(tag)) parts.push(tag);
  }
  return parts.join("+");
}

function mixTag(prev, incoming, fields, tagField) {
  const incomingHas = fields.some((name) => incoming[name] != null);
  const kept = fields.some((name) => incoming[name] == null && prev[name] != null);
  if (incomingHas && kept) return joinExtract(incoming[tagField], prev[tagField]);
  if (incomingHas) return incoming[tagField] || prev[tagField] || "";
  return prev[tagField] || "";
}

/**
 * Incoming non-null fields replace base. Nulls do not erase a value, and
 * weeks present only in base stay. Later official parses are passed as
 * incoming; Zenodo stays in base.
 */
export function mergeCnicPreferIncoming(base, incoming) {
  const map = new Map();
  for (const row of base ?? []) {
    if (!row?.year || !row.week) continue;
    map.set(weekKeyOf(row.year, row.week), cloneRow(row));
  }
  for (const row of incoming ?? []) {
    if (!row?.year || !row.week) continue;
    const key = weekKeyOf(row.year, row.week);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, cloneRow(row));
      continue;
    }
    const next = { ...prev };
    for (const name of NUMERIC) {
      if (row[name] != null) next[name] = row[name];
    }
    next.ili_extract = mixTag(prev, row, ILI_FIELDS, "ili_extract");
    next.lab_extract = mixTag(prev, row, LAB_FIELDS, "lab_extract");
    if (row.source_url) next.source_url = row.source_url;
    if (row.publish_date) next.publish_date = row.publish_date;
    if (row.reference_date) next.reference_date = row.reference_date;
    if (row.target_end_date) next.target_end_date = row.target_end_date;
    map.set(key, next);
  }
  return [...map.values()]
    .filter(hasSignal)
    .sort((a, b) => a.reference_date.localeCompare(b.reference_date) || a.week - b.week);
}

/** Backfill, then any rows already on disk, then this crawl. */
export function assembleCnicRows({ backfill = [], existing = [], fresh = [] } = {}) {
  return mergeCnicPreferIncoming(mergeCnicPreferIncoming(backfill, existing), fresh);
}

export function toFlat(text) {
  return String(text ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/％/g, "%")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "");
}

function htmlCells(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/td>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return text
    .split(/\n/)
    .map((line) => line.replace(/％/g, "%").replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, ""))
    .filter(Boolean);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanePercent(value, max) {
  if (value == null || value < 0 || value > max) return null;
  return value;
}

function firstNumber(flat, pattern) {
  const match = flat.match(pattern);
  return match ? num(match[1]) : null;
}

function fillProse(row, flat) {
  const publish = flat.match(/发布时间[:：](\d{4}-\d{2}-\d{2})/);
  if (publish && !row.publish_date) row.publish_date = publish[1];

  row.ili_south = sanePercent(
    firstNumber(
      flat,
      /南方省份(?:[^。%]{0,30})?哨点医院(?:报告的)?(?:诊室)?(?:流感样病例占门急诊病例总数百分比\()?ILI%\)?[为(](\d+(?:\.\d+)?)%/,
    ),
    30,
  );
  row.ili_north = sanePercent(
    firstNumber(flat, /北方省份(?:[^。%]{0,30})?哨点医院(?:报告的)?(?:诊室)?ILI%\)?[为(](\d+(?:\.\d+)?)%/),
    30,
  );
  if (row.ili_south == null || row.ili_north == null) {
    const paired = flat.match(/南、北方省份哨点医院ILI%分别为(\d+(?:\.\d+)?)%、(\d+(?:\.\d+)?)%/);
    if (paired) {
      if (row.ili_south == null) row.ili_south = sanePercent(num(paired[1]), 30);
      if (row.ili_north == null) row.ili_north = sanePercent(num(paired[2]), 30);
    }
  }

  row.positivity_south = sanePercent(
    firstNumber(flat, /南方省份(?:[^。]{0,16})?(?:流感(?:病毒)?检测|标本检测)阳性率为(\d+(?:\.\d+)?)%/),
    100,
  );
  const northZero = /北方省份未检测到流感病毒阳性标本/.test(flat);
  row.positivity_north = sanePercent(
    firstNumber(flat, /北方省份(?:[^。]{0,16})?(?:流感(?:病毒)?检测|标本检测)阳性率为(\d+(?:\.\d+)?)%/),
    100,
  );
  if (row.positivity_north == null && northZero) {
    row.positivity_north = 0;
    row.positives_north = 0;
  }
  if (row.positivity_south == null || row.positivity_north == null) {
    const paired = flat.match(/南、北方(?:省份|片)[^。]{0,80}?阳性率分别为(\d+(?:\.\d+)?)%、(\d+(?:\.\d+)?)%/);
    if (paired) {
      if (row.positivity_south == null) row.positivity_south = sanePercent(num(paired[1]), 100);
      if (row.positivity_north == null) row.positivity_north = sanePercent(num(paired[2]), 100);
    }
  }

  const national =
    flat.match(/共检测流感样病例监测标本(\d+)份，流感病毒阳性标本(\d+)份\((\d+(?:\.\d+)?)%\)/) ||
    flat.match(/共检测(\d+)份标本，其中流感病毒阳性标本(\d+)份\((\d+(?:\.\d+)?)%\)/) ||
    flat.match(/共检测(\d+)份标本，其中流感病毒阳性标本(\d+)份，占(\d+(?:\.\d+)?)%/);
  if (national) {
    row.tests_national = num(national[1]);
    row.positives_national = num(national[2]);
    row.positivity_national = sanePercent(num(national[3]), 100);
  } else {
    const testsOnly = flat.match(/共检测(?:流感样病例监测标本)?(\d+)份[。.]/);
    if (testsOnly && row.tests_national == null) row.tests_national = num(testsOnly[1]);
  }

  const typed = flat.match(/A型流感(?:病毒)?(\d+)份\((\d+(?:\.\d+)?)%\)，B型流感(?:病毒)?(\d+)份\((\d+(?:\.\d+)?)%\)/);
  if (typed) {
    row.a_national = num(typed[1]);
    row.b_national = num(typed[3]);
  }

  const southPos = flat.match(/南方省份检测到(\d+)份流感病毒阳性标本/);
  const northPos = flat.match(/北方省份检测到(\d+)份流感病毒阳性标本/);
  if (southPos) row.positives_south = num(southPos[1]);
  if (northPos) row.positives_north = num(northPos[1]);

  const outbreaks =
    flat.match(/全国共报告(\d+)起流感样病例暴发疫情/) || flat.match(/本周报告(\d+)起流感样病例暴发疫情/);
  if (outbreaks) row.outbreaks = num(outbreaks[1]);
}

function classifyLabel(label) {
  const text = String(label ?? "").replace(/\s+/g, "");
  if (!text || text.length > 40) return null;
  for (const [name, pattern] of SUBTYPE_ORDER) {
    if (pattern.test(text)) return name;
  }
  return null;
}

function sumsClose(values) {
  if (!values || values.length !== 3) return false;
  return Math.abs(values[0] + values[1] - values[2]) <= 2;
}

function applyTriple(row, prefix, counts, percents) {
  if (!counts || counts.length !== 3 || !sumsClose(counts)) return false;
  const [south, north, national] = ["south", "north", "national"];
  row[`${prefix}_${south}`] = counts[0];
  row[`${prefix}_${north}`] = counts[1];
  row[`${prefix}_${national}`] = counts[2];
  if (prefix === "positives" && percents) {
    row.positivity_south = sanePercent(percents[0], 100);
    row.positivity_north = sanePercent(percents[1], 100);
    row.positivity_national = sanePercent(percents[2], 100);
  }
  return true;
}

function parseHtmlTable(html) {
  const cells = htmlCells(html);
  const start = cells.findIndex((cell) => cell === "检测数");
  if (start < 0) return null;
  const tests = [];
  let i = start + 1;
  while (i < cells.length && tests.length < 3) {
    if (/^\d+$/.test(cells[i])) tests.push(num(cells[i]));
    else if (tests.length) return null;
    i += 1;
  }
  if (!sumsClose(tests)) return null;
  while (i < cells.length && !cells[i].startsWith("阳性数")) i += 1;
  if (i >= cells.length) return null;
  i += 1;
  const positiveCounts = [];
  const positivePct = [];
  while (i < cells.length && positiveCounts.length < 3) {
    const match = cells[i].match(/^(\d+)(?:\(([\d.]+)%?\))?$/);
    if (match) {
      positiveCounts.push(num(match[1]));
      positivePct.push(match[2] == null ? null : num(match[2]));
    } else if (positiveCounts.length) return null;
    i += 1;
  }
  if (!sumsClose(positiveCounts)) return null;
  const subtypes = {};
  while (i < cells.length) {
    if (/^(抗原性|暴发疫情|流感问答|友情链接|图\d)/.test(cells[i])) break;
    let label = "";
    while (i < cells.length && !/^\d+(\([\d.]+%?\))?$/.test(cells[i])) {
      if (/^(抗原性|暴发疫情|流感问答|友情链接)/.test(cells[i])) break;
      label += cells[i];
      i += 1;
      if (label.length > 40) break;
    }
    const kind = classifyLabel(label);
    const counts = [];
    while (i < cells.length && counts.length < 3 && /^\d+(\([\d.]+%?\))?$/.test(cells[i])) {
      counts.push(num(cells[i].match(/^(\d+)/)[1]));
      i += 1;
    }
    if (kind && kind !== "skip" && sumsClose(counts)) subtypes[kind] = counts;
    else if (!kind && counts.length) break;
  }
  return { tests, positiveCounts, positivePct, subtypes };
}

function parsePlainTable(text) {
  const compact = String(text)
    .replace(/％/g, "%")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]*\r?\n[ \t]*/g, " ")
    .replace(/[ \t]{2,}/g, " ");
  const head = compact.match(
    /检测数\s+(\d+)\s+(\d+)\s+(\d+)\s+阳性数\s*\(%\)\s+(\d+)\(([\d.]+)\s*%\)\s+(\d+)\(([\d.]+)\s*%\)\s+(\d+)\(([\d.]+)\s*%\)/,
  );
  if (!head) return null;
  const tests = [num(head[1]), num(head[2]), num(head[3])];
  const positiveCounts = [num(head[4]), num(head[6]), num(head[8])];
  const positivePct = [num(head[5]), num(head[7]), num(head[9])];
  if (!sumsClose(tests) || !sumsClose(positiveCounts)) return null;
  const slice = compact.slice(head.index, head.index + 1800);
  const subtypes = {};
  const rowRe =
    /(A\(H1N1\)pdm09|A\(H3N2\)|A\(unsubtyped\)|季节性\s*A\(H3N2\)|甲型\s*\(H1N1\)|甲型\s*H1N1|A型|B型|B\s*未分系|Victoria|Yamagata)\s+(\d+)(?:\(([\d.]+)\s*%\))?\s+(\d+)(?:\(([\d.]+)\s*%\))?\s+(\d+)(?:\(([\d.]+)\s*%\))?/g;
  for (const match of slice.matchAll(rowRe)) {
    const kind = classifyLabel(match[1]);
    const counts = [num(match[2]), num(match[4]), num(match[6])];
    if (kind && kind !== "skip" && sumsClose(counts) && !subtypes[kind]) subtypes[kind] = counts;
  }
  return { tests, positiveCounts, positivePct, subtypes };
}

function applyLab(row, lab) {
  if (!lab) return;
  applyTriple(row, "tests", lab.tests);
  applyTriple(row, "positives", lab.positiveCounts, lab.positivePct);
  for (const [kind, counts] of Object.entries(lab.subtypes ?? {})) {
    if (!sumsClose(counts)) continue;
    if (row.positives_national != null && counts[2] > row.positives_national + 2) continue;
    applyTriple(row, kind, counts);
  }
}

export function parseReportText(input, meta = {}) {
  const source = String(input ?? "");
  if (!source.trim()) return null;
  const isHtml = /<\/p>|<html|<td[\s>]/i.test(source);
  const row = blankCnicRow(meta);
  fillProse(row, toFlat(source));
  applyLab(row, isHtml ? parseHtmlTable(source) : parsePlainTable(source));
  // Some 2021–2022 PDFs print the national denominator and the two regional
  // positive counts, and leave the percent in a figure. The percent is then
  // positives / tests, rounded to 0.1 like the printed reports.
  if (row.positives_national == null && row.positives_south != null && row.positives_north != null) {
    row.positives_national = row.positives_south + row.positives_north;
  }
  if (
    row.positivity_national == null &&
    row.positives_national != null &&
    row.tests_national != null &&
    row.tests_national > 0
  ) {
    row.positivity_national = Math.round((row.positives_national / row.tests_national) * 1000) / 10;
  }
  if (!hasSignal(row)) return null;
  const tag = meta.extract || (isHtml ? "cnic-html" : "cnic-pdf");
  if (row.ili_south != null || row.ili_north != null) row.ili_extract = tag;
  if (LAB_FIELDS.some((name) => row[name] != null)) row.lab_extract = tag;
  return row;
}

export function rowsFromZenodo(panelCsv, manifestCsv) {
  const manifest = new Map();
  for (const row of parseCsv(manifestCsv)) {
    manifest.set(`${Number(row.year)}-${Number(row.week)}`, row);
  }
  const out = [];
  for (const row of parseCsv(panelCsv)) {
    const year = Number(row.year);
    const week = Number(row.week);
    if (!year || !week) continue;
    const page = manifest.get(`${year}-${week}`);
    const record = blankCnicRow({
      year,
      week,
      source_url: page?.page_url || "",
      publish_date: row.publish_date || page?.publish_date || "",
    });
    const range = isoWeekRange(year, week);
    record.reference_date = range.reference_date;
    record.target_end_date = range.target_end_date;
    const take = (field, raw) => {
      if (raw == null || String(raw).trim() === "") return;
      const n = Number(raw);
      if (Number.isFinite(n)) record[field] = n;
    };
    take("ili_south", row.ili_south);
    take("ili_north", row.ili_north);
    take("tests_national", row.tests_total);
    take("positives_national", row.positives_total);
    take("positivity_national", row.positivity_total_pct);
    take("a_national", row.a_total);
    take("h1_national", row.h1pdm09_total);
    take("h3_national", row.h3n2_total);
    take("b_national", row.b_total);
    take("bvic_national", row.bvic_total);
    take("outbreaks", row.outbreaks);
    if (!hasSignal(record)) continue;
    if (record.ili_south != null || record.ili_north != null) record.ili_extract = ZENODO_EXTRACT;
    if (LAB_FIELDS.some((name) => record[name] != null)) record.lab_extract = ZENODO_EXTRACT;
    out.push(record);
  }
  return out;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weeksBetween(startDate, endDate) {
  const out = [];
  if (!startDate || !endDate || startDate > endDate) return out;
  let cursor = startDate;
  while (cursor <= endDate) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

function groupDateGaps(dates) {
  if (!dates.length) return [];
  const groups = [];
  let start = dates[0];
  let prev = dates[0];
  for (const date of dates.slice(1)) {
    if (date === addDays(prev, 7)) prev = date;
    else {
      groups.push(start === prev ? weekKeyOf(isoWeekYearFromDate(start), isoWeekNumberFromDate(start)) : `${weekKeyOf(isoWeekYearFromDate(start), isoWeekNumberFromDate(start))}/${weekKeyOf(isoWeekYearFromDate(prev), isoWeekNumberFromDate(prev))}`);
      start = date;
      prev = date;
    }
  }
  groups.push(
    start === prev
      ? weekKeyOf(isoWeekYearFromDate(start), isoWeekNumberFromDate(start))
      : `${weekKeyOf(isoWeekYearFromDate(start), isoWeekNumberFromDate(start))}/${weekKeyOf(isoWeekYearFromDate(prev), isoWeekNumberFromDate(prev))}`,
  );
  return groups;
}

export function metricCoverage(rows, predicate) {
  const kept = (rows ?? []).filter(predicate).sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  if (!kept.length) return null;
  const present = new Set(kept.map((row) => row.reference_date));
  const missing = weeksBetween(kept[0].reference_date, kept.at(-1).reference_date).filter((date) => !present.has(date));
  return {
    first_key: weekKeyOf(kept[0].year, kept[0].week),
    last_key: weekKeyOf(kept.at(-1).year, kept.at(-1).week),
    reference_date: kept[0].reference_date,
    target_end_date: kept.at(-1).target_end_date,
    weeks: kept.length,
    gaps: groupDateGaps(missing),
  };
}

export function cnicCoverage(rows) {
  const sorted = [...(rows ?? [])].sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  const ili = metricCoverage(sorted, (row) => row.ili_south != null || row.ili_north != null);
  const positivity = metricCoverage(
    sorted,
    (row) => row.positivity_south != null || row.positivity_north != null || row.positivity_national != null,
  );
  return {
    rows: sorted.length,
    first_key: sorted[0] ? weekKeyOf(sorted[0].year, sorted[0].week) : null,
    last_key: sorted.at(-1) ? weekKeyOf(sorted.at(-1).year, sorted.at(-1).week) : null,
    ili,
    positivity,
  };
}

export function loadCnicBackfill() {
  if (!existsSync(CNIC_BACKFILL_CSV)) return [];
  return parseCnicCsv(readFileSync(CNIC_BACKFILL_CSV, "utf8"));
}

export function loadCnicMain() {
  if (!existsSync(CNIC_CSV)) return [];
  return parseCnicCsv(readFileSync(CNIC_CSV, "utf8"));
}

export function writeCnicFiles(records) {
  const text = recordsToCsv(records);
  mkdirSync(dirname(CNIC_CSV), { recursive: true });
  mkdirSync(dirname(CNIC_BACKFILL_CSV), { recursive: true });
  const mainChanged = !existsSync(CNIC_CSV) || readFileSync(CNIC_CSV, "utf8") !== text;
  const backfillChanged = !existsSync(CNIC_BACKFILL_CSV) || readFileSync(CNIC_BACKFILL_CSV, "utf8") !== text;
  if (mainChanged) writeFileSync(CNIC_CSV, text);
  if (backfillChanged) writeFileSync(CNIC_BACKFILL_CSV, text);
  return { rows: records.length, mainChanged, backfillChanged };
}

export function writeCnicBackfill(records) {
  const text = recordsToCsv(records);
  mkdirSync(dirname(CNIC_BACKFILL_CSV), { recursive: true });
  if (!existsSync(CNIC_BACKFILL_CSV) || readFileSync(CNIC_BACKFILL_CSV, "utf8") !== text) {
    writeFileSync(CNIC_BACKFILL_CSV, text);
  }
}
