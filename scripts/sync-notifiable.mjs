#!/usr/bin/env node
/**
 * Crawl China CDC monthly notifiable-disease bulletins and emit a
 * pathogen-level CSV from monthly China CDC HTML tables.
 *
 * Listing: https://www.chinacdc.cn/jksj/jksj01/
 * Each monthly HTML page contains 病名 / 发病数 / 死亡数.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { fetchText } from "./cdc-http.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const SNAP = join(DATA, "notifiable");
const LISTING = "https://www.chinacdc.cn/jksj/jksj01/";

const SUMMARY = /总计|合计/;
const HEPATITIS_GROUP = "病毒性肝炎";
const CLASS_A = new Set(["鼠疫", "霍乱"]);
const HEADER =
  "reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,cases,deaths,source_url";

export function cleanDisease(raw) {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .replace(/[*＊]+$/g, "")
    .replace(/[0-9０-９]+$/g, "");
}

export function stripCell(raw) {
  const text = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function parseNumber(raw) {
  const t = stripCell(raw).replace(/,/g, "").replace(/[\s\u00a0\u3000]+/g, "");
  if (!t || t === "-" || t === "—") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const HEP_TYPES = new Set([
  "甲型肝炎",
  "乙型肝炎",
  "丙型肝炎",
  "丁型肝炎",
  "戊型肝炎",
  "未分型肝炎",
  "肝炎未分型",
]);

function monthGroups(records) {
  const map = new Map();
  for (const row of records) {
    if (!map.has(row.month)) map.set(row.month, []);
    map.get(row.month).push(row);
  }
  return map;
}

function sumFields(rows, field) {
  return rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
}

/**
 * Recover cells the HTML parser still misses: 甲肝=0 when the hepatitis
 * group total is larger, and summary deaths=0 when disease rows have deaths.
 */
export function reconcileNotifiable(records) {
  for (const rows of monthGroups(records).values()) {
    const group = rows.find((r) => r.disease === HEPATITIS_GROUP && r.row_kind === "group");
    const types = rows.filter((r) => HEP_TYPES.has(r.disease));
    const jia = rows.find((r) => r.disease === "甲型肝炎");
    if (group && jia && types.length) {
      const dCases = group.cases - sumFields(types, "cases");
      const dDeaths = group.deaths - sumFields(types, "deaths");
      if (jia.cases === 0 && dCases > 0 && dCases < 20000) jia.cases = dCases;
      if (jia.deaths === 0 && dDeaths > 0 && dDeaths < 200) jia.deaths = dDeaths;
    }

    const a = rows.filter((r) => r.row_kind === "disease" && r.disease_class === "甲类");
    const bNoHep = rows.filter(
      (r) => r.row_kind === "disease" && r.disease_class === "乙类" && !HEP_TYPES.has(r.disease),
    );
    const c = rows.filter((r) => r.row_kind === "disease" && r.disease_class === "丙类");
    const hep = group ? [group] : [];
    const abCases = sumFields([...a, ...bNoHep, ...hep], "cases");
    const abDeaths = sumFields([...a, ...bNoHep, ...hep], "deaths");
    const cCases = sumFields(c, "cases");
    const cDeaths = sumFields(c, "deaths");

    for (const row of rows) {
      if (row.row_kind !== "summary") continue;
      if (row.disease.includes("甲乙丙")) {
        if (row.cases === 0 && abCases + cCases > 0) row.cases = abCases + cCases;
        if (row.deaths === 0 && abDeaths + cDeaths > 0) row.deaths = abDeaths + cDeaths;
      } else if (row.disease.includes("甲乙") && !row.disease.includes("丙")) {
        if (row.cases === 0 && abCases > 0) row.cases = abCases;
        if (row.deaths === 0 && abDeaths > 0) row.deaths = abDeaths;
      } else if (row.disease.includes("丙类") && !row.disease.includes("甲乙")) {
        if (row.cases === 0 && cCases > 0) row.cases = cCases;
        if (row.deaths === 0 && cDeaths > 0) row.deaths = cDeaths;
      }
    }
  }
  return records;
}

export function applyNotifiableCorrections(records) {
  let patches = [];
  try {
    patches = JSON.parse(readFileSync(join(DATA, "corrections", "notifiable.json"), "utf8"));
  } catch {
    return records;
  }
  for (const p of patches) {
    const row = records.find((r) => r.month === p.month && r.disease === p.disease);
    if (!row) continue;
    if (p.from !== undefined && Number(row[p.field]) !== Number(p.from) && row[p.field] !== p.from) {
      continue;
    }
    row[p.field] = p.to;
  }
  return records;
}

export function finalizeNotifiable(records) {
  reconcileNotifiable(records);
  applyNotifiableCorrections(records);
  return records;
}

function rowKind(name) {
  if (SUMMARY.test(name)) return "summary";
  if (name === HEPATITIS_GROUP) return "group";
  return "disease";
}

function parseTables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
}

function parseRows(tableHtml) {
  const rows = [];
  for (const tr of tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripCell(m[1]),
    );
    const nonempty = cells.filter((c) => c && c !== " ");
    if (nonempty.length >= 3) rows.push(nonempty.slice(0, 3));
  }
  return rows;
}

export function extractMonth(html, title) {
  const fromTitle = (title || "").match(/(\d{4})年(\d{1,2})月/);
  const fromBody = html.match(/(\d{4})年(\d{1,2})月全国/);
  const m = fromTitle || fromBody;
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
}

export function extractReportDate(html) {
  const m =
    html.match(/时间[:：]\s*(\d{4}-\d{2}-\d{2})/) ||
    html.match(/时间[:：][\s\S]{0,240}?(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? "";
}

export function parseBulletin(html, sourceUrl, title = "") {
  const month = extractMonth(html, title);
  if (!month) return [];
  const reportDate = extractReportDate(html);
  const table = parseTables(html).find((t) => /病名/.test(t));
  if (!table) return [];
  const rows = parseRows(table);
  if (rows.length < 4) return [];

  const out = [];
  let diseaseClass = "乙类";
  for (const [nameRaw, casesRaw, deathsRaw] of rows) {
    const name = cleanDisease(nameRaw);
    if (!name || name === "病名") continue;
    if (name.includes("丙类") && SUMMARY.test(name)) {
      diseaseClass = "丙类";
    } else if (name.includes("重点监测") && SUMMARY.test(name)) {
      diseaseClass = "重点监测";
    } else if (name.includes("甲乙") && SUMMARY.test(name)) {
      diseaseClass = "乙类";
    }
    const kind = rowKind(name);
    let klass = diseaseClass;
    if (CLASS_A.has(name)) klass = "甲类";
    if (kind === "summary") {
      if (name.includes("甲乙丙")) klass = "甲乙丙类";
      else if (name.includes("甲乙")) klass = "甲乙类";
    }
    out.push({
      month,
      report_date: reportDate,
      disease: name,
      disease_class: klass,
      row_kind: kind,
      cases: parseNumber(casesRaw),
      deaths: parseNumber(deathsRaw),
      source_url: sourceUrl,
    });
  }
  return reconcileNotifiable(out);
}

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return {
    reference_date: `${month}-01`,
    target_end_date: last.toISOString().slice(0, 10),
  };
}

function toCsv(records) {
  const body = records.map((r) => {
    const range = monthRange(r.month);
    return [
      range.reference_date,
      range.target_end_date,
      r.month,
      r.report_date,
      r.disease,
      r.disease_class,
      r.row_kind,
      r.cases,
      r.deaths,
      r.source_url,
    ].join(",");
  });
  return [HEADER, ...body].join("\n") + "\n";
}

function listingUrl(page) {
  if (page <= 1) return LISTING;
  return new URL(`index_${page - 1}.html`, LISTING).href;
}

function discoverLinks(html, base) {
  const found = [];
  for (const m of html.matchAll(/href="([^"]+)"[^>]*>([^<]*\d{4}年\d{1,2}月全国(?:法定)?传染病疫情概况[^<]*)</g)) {
    found.push({ href: new URL(m[1], base).href, title: m[2].trim() });
  }
  return found;
}

export function monthKeyFromTitle(title) {
  const m = String(title).match(/(\d{4})年(\d{1,2})月/);
  if (!m) return "";
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
}

function newestLinksFirst(links) {
  return [...links].sort((a, b) => monthKeyFromTitle(b.title).localeCompare(monthKeyFromTitle(a.title)));
}

export async function crawlNotifiable({ maxPages = 8, pauseMs = 400 } = {}) {
  const seen = new Map();
  for (let page = 1; page <= maxPages; page++) {
    const url = listingUrl(page);
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      if (String(err.message).includes("HTTP 404")) break;
      throw err;
    }
    const links = discoverLinks(html, url);
    if (links.length === 0) {
      if (page === 1 && seen.size === 0) throw new Error("notifiable listing: 0 bulletin links");
      break;
    }
    for (const link of links) {
      if (seen.has(link.href)) continue;
      seen.set(link.href, link);
    }
    await delay(pauseMs);
  }

  if (seen.size === 0) throw new Error("notifiable listing: 0 bulletin links");

  const byKey = new Map();
  const ordered = newestLinksFirst([...seen.values()]);
  for (let i = 0; i < ordered.length; i++) {
    const { href, title } = ordered[i];
    const latest = i === 0;
    try {
      const html = await fetchText(href);
      const rows = parseBulletin(html, href, title);
      if (rows.length === 0) {
        if (latest) throw new Error(`latest notifiable bulletin parsed 0 rows: ${title}`);
        console.warn("no table", title);
        continue;
      }
      console.log("parsed", title, rows.filter((r) => r.row_kind !== "summary").length, "diseases");
      for (const row of rows) {
        byKey.set(`${row.month}|${row.disease}`, row);
      }
    } catch (err) {
      if (latest) throw err;
      console.warn("skip", href, err.message);
    }
    await delay(pauseMs);
  }

  const records = [...byKey.values()].sort((a, b) => {
    const d = a.month.localeCompare(b.month);
    if (d !== 0) return d;
    return a.disease.localeCompare(b.disease, "zh");
  });
  return records;
}

export function writeOutputs(records) {
  finalizeNotifiable(records);
  mkdirSync(SNAP, { recursive: true });
  writeFileSync(join(DATA, "notifiable_all.csv"), toCsv(records));
  const months = [...new Set(records.map((r) => r.month))];
  for (const month of months) {
    writeFileSync(join(SNAP, `${month}.csv`), toCsv(records.filter((r) => r.month === month)));
  }
  console.log("wrote notifiable_all.csv", records.length, "rows", months.length, "months");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  mkdirSync(DATA, { recursive: true });
  const records = await crawlNotifiable();
  if (records.length === 0) {
    console.error("no notifiable records extracted");
    process.exit(1);
  }
  writeOutputs(records);
}
