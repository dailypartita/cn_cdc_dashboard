#!/usr/bin/env node
/**
 * Crawl China CDC weekly sentinel bulletins and parse 表1 into the
 * 11-pathogen long table. Figures 2–3 are images; the weekly series is
 * stacked Table 1 rows, same as the former cn_cdc_crawl archive.
 *
 * Listing: https://www.chinacdc.cn/jksj/jksj04_14275/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { applySurveillanceFileFixes, formatSurveillanceCsv, parseSurveillanceCsv } from "./qa-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const LISTING = "https://www.chinacdc.cn/jksj/jksj04_14275/";
const UA =
  process.env.CDC_CRAWL_UA ??
  "cn-cdc-dashboard/0.1 (research archive; non-official structured data)";
const HEADER = ["reference_date", "target_end_date", "report_week", "pathogen", "ili_percent", "sari_percent"];

const PATHOGENS = [
  "新型冠状病毒",
  "流感病毒",
  "呼吸道合胞病毒",
  "腺病毒",
  "人偏肺病毒",
  "副流感病毒",
  "普通冠状病毒",
  "博卡病毒",
  "鼻病毒",
  "肠道病毒",
  "肺炎支原体",
];
const PATHOGEN_SET = new Set(PATHOGENS);

export function stripCell(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRate(raw) {
  const t = stripCell(raw).replace(/,/g, "");
  if (!t || t === "-" || t === "—" || t === "–") return null;
  if (/^[+-]/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseTables(html) {
  const tables = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const rows = [];
    for (const rm of tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rm[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripCell(m[1]));
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

export function isTable1(rows) {
  const names = rows.map((r) => r[0]?.replace(/\s+/g, "") ?? "");
  return names.includes("新型冠状病毒") && names.includes("流感病毒");
}

export function parseTable1(rows) {
  const out = [];
  for (const cells of rows) {
    const name = stripCell(cells[0]).replace(/\s+/g, "");
    if (!PATHOGEN_SET.has(name)) continue;
    const compact = cells.slice(1).map(stripCell).filter(Boolean);
    const ili = parseRate(compact[0]);
    let sari = parseRate(compact[2]);
    if (sari == null && compact.length >= 4) sari = parseRate(compact[3]);
    out.push({ pathogen: name, ili_percent: ili, sari_percent: sari });
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function parseWeekMeta(html, title = "") {
  const text = `${title}\n${html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")}`;
  const week =
    text.match(/(\d{4})\s*年\s*第\s*(\d{1,2})\s*周/) ||
    title.match(/(\d{4})年第(\d{1,2})周/);
  const range = text.match(
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[—–\-至到]+\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  );
  if (!week || !range) return null;
  const year = Number(week[1]);
  const report_week = Number(week[2]);
  const y2 = Number(range[4] || range[1]);
  const reference_date = `${range[1]}-${pad2(range[2])}-${pad2(range[3])}`;
  const target_end_date = `${y2}-${pad2(range[5])}-${pad2(range[6])}`;
  return { year, report_week, reference_date, target_end_date };
}

export function parseBulletin(html, sourceUrl, title = "") {
  const meta = parseWeekMeta(html, title);
  if (!meta) return [];
  const table = parseTables(html).find(isTable1);
  if (!table) return [];
  return parseTable1(table).map((row) => ({
    ...meta,
    ...row,
    source_url: sourceUrl,
  }));
}

async function fetchText(url, { retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await delay(1200 * 2 ** i);
    }
  }
  throw lastErr;
}

function listingUrl(page) {
  if (page <= 1) return LISTING;
  return new URL(`index_${page - 1}.html`, LISTING).href;
}

export function discoverLinks(html, base) {
  const found = [];
  for (const m of html.matchAll(/href="([^"]+)"[^>]*>([^<]*\d{4}年第\d{1,2}周[^<]*)</g)) {
    found.push({ href: new URL(m[1], base).href, title: m[2].trim() });
  }
  return found;
}

export async function crawlSentinel({ maxPages = 12, pauseMs = 250 } = {}) {
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
    if (links.length === 0) break;
    for (const link of links) {
      if (!seen.has(link.href)) seen.set(link.href, link);
    }
    await delay(pauseMs);
  }

  const byKey = new Map();
  for (const { href, title } of seen.values()) {
    try {
      const html = await fetchText(href);
      const rows = parseBulletin(html, href, title);
      if (rows.length === 0) {
        console.warn("no table1", title);
      } else {
        console.log("parsed", title, rows.length, "pathogens", rows[0].reference_date);
        for (const row of rows) {
          byKey.set(`${row.reference_date}|${row.pathogen}`, row);
        }
      }
    } catch (err) {
      console.warn("skip", href, err.message);
    }
    await delay(pauseMs);
  }

  return [...byKey.values()];
}

function loadExisting(name) {
  const path = join(DATA, name);
  if (!existsSync(path)) return [];
  return parseSurveillanceCsv(readFileSync(path, "utf8")).rows;
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const d = b.reference_date.localeCompare(a.reference_date);
    if (d !== 0) return d;
    return a.pathogen.localeCompare(b.pathogen, "zh");
  });
}

export function mergeSurveillance(existing, incoming) {
  const map = new Map(existing.map((r) => [`${r.reference_date}|${r.pathogen}`, r]));
  let added = 0;
  let updated = 0;
  for (const row of incoming) {
    const key = `${row.reference_date}|${row.pathogen}`;
    const prev = map.get(key);
    const next = {
      reference_date: row.reference_date,
      target_end_date: row.target_end_date,
      report_week: row.report_week,
      pathogen: row.pathogen,
      ili_percent: row.ili_percent,
      sari_percent: row.sari_percent,
    };
    if (!prev) {
      map.set(key, next);
      added += 1;
    } else {
      const changed =
        prev.target_end_date !== next.target_end_date ||
        Number(prev.report_week) !== Number(next.report_week) ||
        Number(prev.ili_percent) !== Number(next.ili_percent) ||
        Number(prev.sari_percent) !== Number(next.sari_percent);
      map.set(key, next);
      if (changed) updated += 1;
    }
  }
  return { rows: sortRows([...map.values()]), added, updated };
}

export function writeOutputs(records) {
  mkdirSync(DATA, { recursive: true });
  const existing = loadExisting("cncdc_surveillance_all.csv");
  const { rows, added, updated } = mergeSurveillance(existing, records);
  writeFileSync(join(DATA, "cncdc_surveillance_all.csv"), formatSurveillanceCsv(HEADER, rows));
  console.log("wrote cncdc_surveillance_all.csv", rows.length, "rows", "added", added, "updated", updated);
  return { rows, added, updated };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  mkdirSync(DATA, { recursive: true });
  const records = await crawlSentinel();
  if (records.length === 0) {
    console.error("no sentinel table1 rows extracted");
    process.exit(1);
  }
  writeOutputs(records);
  const { applied } = applySurveillanceFileFixes();
  console.log("qa", applied.length, "cell fixes");
}
