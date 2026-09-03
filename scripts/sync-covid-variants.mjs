#!/usr/bin/env node
/**
 * Crawl China CDC monthly COVID bulletins and parse weekly variant shares
 * from the 本土病例病毒变异监测 section. Percentages are in the body text
 * (图5 is a stacked chart without a table).
 *
 * Listing: https://www.chinacdc.cn/jksj/xgbdyq/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { fetchText } from "./cdc-http.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const LISTING = "https://www.chinacdc.cn/jksj/xgbdyq/";
const HEADER =
  "reference_date,target_end_date,year,week,week_start,lineage,share,sequences,month,source_url";

export function compact(text) {
  return String(text ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

export function extractMonth(text) {
  const titled = String(text).match(/全国新型冠状病毒感染疫情情况（(\d{4})年(\d{1,2})月）/);
  const m = titled || String(text).match(/(\d{4})年(\d{1,2})月/);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
}

export function extractReportDate(html) {
  const m = html.match(/时间：[\s\S]{0,120}?(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? "";
}

export function isoWeekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday1 = new Date(jan4);
  monday1.setUTCDate(jan4.getUTCDate() - (dow - 1));
  const monday = new Date(monday1);
  monday.setUTCDate(monday1.getUTCDate() + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export function expandWeeks(w1, w2) {
  const out = [];
  if (w1 <= w2) {
    for (let w = w1; w <= w2; w++) out.push(w);
    return out;
  }
  for (let w = w1; w <= 53; w++) out.push(w);
  for (let w = 1; w <= w2; w++) out.push(w);
  return out;
}

export function parsePercents(raw) {
  return [...String(raw).matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
}

export function canonLineage(raw) {
  let name = String(raw ?? "")
    .replace(/根据采样日期/g, "")
    .replace(/主要流行株为/g, "")
    .replace(/其中主要为.*$/, "")
    .replace(/均为奥密克戎变异株/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/系列变异株/g, "及其亚分支")
    .replace(/及亚分支/g, "及其亚分支")
    .replace(/的?占比$/, "")
    .trim();
  if (!name || /占[A-Z]/.test(name)) return "";
  const token =
    name.match(/[A-Z]{1,4}\s*\.?\s*\d+(?:\s*\.\s*\d+)*/i) || name.match(/XDV|XBB|XFG/i);
  if (!token) return "";
  const key = token[0].replace(/\s+/g, "").toUpperCase();
  if (key.startsWith("NB.1.8") || key.startsWith("NB1.8")) return "NB.1.8.1及其亚分支";
  if (key.startsWith("XDV")) return "XDV及其亚分支";
  if (key.startsWith("JN.1") || key.startsWith("JN1")) return "JN.1及其亚分支";
  if (key.startsWith("KP.2") || key.startsWith("KP2")) return "KP.2及其亚分支";
  if (key.startsWith("XFG")) return "XFG及其亚分支";
  if (key.startsWith("EG.5") || key.startsWith("EG5")) return "EG.5及其亚分支";
  if (key.startsWith("XBB")) return "XBB及其亚分支";
  if (key.startsWith("BA.5.2") || key.startsWith("BA5.2")) return "BA.5.2及其亚分支";
  if (key.startsWith("BF.7") || key.startsWith("BF7")) return "BF.7及其亚分支";
  if (key.startsWith("BA.2.75")) return "BA.2.75及其亚分支";
  return `${key}及其亚分支`;
}

function weekYear(month, week, w1, w2) {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  if (w1 > w2) {
    return week >= w1 ? year - 1 : year;
  }
  if (mon === 1 && week >= 50) return year - 1;
  if (mon === 12 && week <= 4) return year + 1;
  return year;
}

export function parseBulletin(html, sourceUrl) {
  const compactHtml = compact(html);
  const month = extractMonth(compactHtml);
  if (!month) return [];

  const start = compactHtml.indexOf("变异监测");
  if (start < 0) return [];
  let end = compactHtml.indexOf("建议公众", start);
  if (end < 0) end = compactHtml.indexOf("个人防护", start);
  if (end < 0) end = Math.min(compactHtml.length, start + 1800);
  const chunk = compactHtml.slice(start, end);

  const sequences = Number((chunk.match(/报送(\d+)例/) || [])[1] || "") || "";
  const ranges = [...compactHtml.matchAll(/第(\d+)周(?:（[^）]{0,80}）)?至第(\d+)周/g)].map((m) => ({
    w1: Number(m[1]),
    w2: Number(m[2]),
    index: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

  const rows = [];
  for (const m of chunk.matchAll(/([^，。；]{2,160}?)占比分别为([\d.%，、,]+)/g)) {
    const lineage = canonLineage(m[1]);
    const values = parsePercents(m[2]);
    if (!lineage || values.length === 0) continue;
    const pctAt = start + (m.index ?? 0) + m[1].length;
    const range = [...ranges].reverse().find((r) => r.index < pctAt);
    if (!range) continue;
    const weeksAll = expandWeeks(range.w1, range.w2);
    const weeks = values.length < weeksAll.length ? weeksAll.slice(weeksAll.length - values.length) : weeksAll;
    const n = Math.min(weeks.length, values.length);
    for (let i = 0; i < n; i++) {
      const week = weeks[i];
      const year = weekYear(month, week, range.w1, range.w2);
      rows.push({
        year,
        week,
        week_start: isoWeekMonday(year, week),
        lineage,
        share: values[i],
        sequences,
        month,
        source_url: sourceUrl,
      });
    }
  }
  return rows;
}

export async function listBulletins() {
  const hrefs = [];
  for (let i = 0; i < 8; i++) {
    const url = i === 0 ? LISTING : `${LISTING}index_${i}.html`;
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      if (String(err.message).includes("404")) break;
      throw err;
    }
    const found = [...html.matchAll(/href="(\.\/\d{6}\/t[^"]+\.html)"/g)].map((m) => m[1]);
    if (found.length === 0) {
      if (i === 0 && hrefs.length === 0) throw new Error("variant listing: 0 bulletin links");
      break;
    }
    hrefs.push(...found);
    await delay(250);
  }
  const seen = new Set();
  const out = [];
  for (const href of hrefs) {
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(new URL(href, LISTING).href);
  }
  if (out.length === 0) throw new Error("variant listing: 0 bulletin links");
  return out;
}

function variantSortKey(url) {
  const m = String(url).match(/\/(\d{6})\//);
  return m ? m[1] : "";
}

function newestUrlsFirst(urls) {
  return [...urls].sort((a, b) => variantSortKey(b).localeCompare(variantSortKey(a)));
}

function addOther(rows) {
  const byWeek = new Map();
  for (const row of rows) {
    const key = `${row.year}-W${String(row.week).padStart(2, "0")}`;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(row);
  }
  const extra = [];
  for (const group of byWeek.values()) {
    const named = new Set(group.map((r) => r.lineage));
    if (named.has("其他")) continue;
    const sum = group.reduce((s, r) => s + r.share, 0);
    const rest = Math.round((100 - sum) * 10) / 10;
    if (rest < 0.3) continue;
    extra.push({ ...group[0], lineage: "其他", share: Math.max(0, rest) });
  }
  return rows.concat(extra);
}

export function dedupe(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.year}|${row.week}|${row.lineage}`;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    const d = a.week_start.localeCompare(b.week_start);
    if (d !== 0) return d;
    return a.lineage.localeCompare(b.lineage, "zh");
  });
}

function addUtcDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function toCsv(rows) {
  const body = rows.map((r) =>
    [
      r.week_start,
      addUtcDays(r.week_start, 6),
      r.year,
      r.week,
      r.week_start,
      r.lineage,
      r.share,
      r.sequences,
      r.month,
      r.source_url,
    ].join(","),
  );
  return [HEADER, ...body].join("\n") + "\n";
}

export async function crawlVariants() {
  const urls = newestUrlsFirst(await listBulletins());
  const all = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const latest = i === 0;
    try {
      const html = await fetchText(url);
      const rows = parseBulletin(html, url);
      if (rows.length === 0) {
        if (latest) throw new Error(`latest variant bulletin parsed 0 rows: ${url}`);
        console.warn("no variant table", url);
        continue;
      }
      console.log("parsed", url, rows.length, "rows");
      all.push(...rows);
    } catch (err) {
      if (latest) throw err;
      console.warn("skip", url, err.message);
    }
    await delay(200);
  }
  return dedupe(addOther(all));
}

export function writeOutputs(rows) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "covid_variants.csv"), toCsv(rows));
  console.log("wrote covid_variants.csv", rows.length, "rows");
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const rows = await crawlVariants();
  if (rows.length === 0) {
    console.error("no variant rows parsed");
    process.exit(1);
  }
  writeOutputs(rows);
}
