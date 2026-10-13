#!/usr/bin/env node
/**
 * Crawl China CDC monthly COVID bulletins and parse weekly variant shares
 * from the 本土病例病毒变异监测 section. Percentages are in the body text
 * (图5 is a stacked chart without a table).
 *
 * Listing: https://www.chinacdc.cn/jksj/xgbdyq/
 *
 * The newest bulletin must yield the week range stated in 变异监测.
 * sync-data exits non-zero when that week is missing or the listing
 * shows a newer month with no fetchable link, instead of leaving
 * catalog.json at crawl=ok / unchanged=true.
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

const SECTION_END_MARKERS = ["建议公众", "个人防护", "文件附件", "相关新闻", "网站导航"];

function rangeRe() {
  return /第(\d+)周(?:（[^）]{0,120}）)?至第(\d+)周/g;
}

function shareRe() {
  return /([^，。；]{2,160}?)占比(?:分别为|分别是|为)([\d.%，、,]+)/g;
}

export function variantSection(compactHtml) {
  const start = compactHtml.indexOf("变异监测");
  if (start < 0) return null;
  let end = compactHtml.length;
  for (const marker of SECTION_END_MARKERS) {
    const i = compactHtml.indexOf(marker, start + "变异监测".length);
    if (i >= 0 && i < end) end = i;
  }
  end = Math.min(end, start + 8000);
  return { start, end, chunk: compactHtml.slice(start, end) };
}

function weekLabel(year, week) {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function rangesIn(text, offset = 0) {
  return [...text.matchAll(rangeRe())].map((m) => ({
    w1: Number(m[1]),
    w2: Number(m[2]),
    index: offset + (m.index ?? 0),
    end: offset + (m.index ?? 0) + m[0].length,
  }));
}

function resolveRange(compactHtml, ranges, pctAt) {
  const range = [...ranges].reverse().find((r) => r.index < pctAt);
  if (range) return range;
  const windowStart = Math.max(0, pctAt - 160);
  const window = compactHtml.slice(windowStart, pctAt);
  const singles = [...window.matchAll(/第(\d+)周/g)];
  const single = singles.at(-1);
  if (!single) return null;
  const week = Number(single[1]);
  const index = windowStart + (single.index ?? 0);
  return { w1: week, w2: week, index, end: index + single[0].length };
}

export function claimedWeekSpan(html) {
  const compactHtml = compact(html);
  const month = extractMonth(compactHtml);
  const section = variantSection(compactHtml);
  if (!month || !section) return null;
  const ranges = [...section.chunk.matchAll(rangeRe())];
  let w1;
  let w2;
  if (ranges.length > 0) {
    const m = ranges[ranges.length - 1];
    w1 = Number(m[1]);
    w2 = Number(m[2]);
  } else {
    const lone = section.chunk.match(/第(\d+)周[^。]{0,160}占比/);
    if (!lone) return null;
    w1 = w2 = Number(lone[1]);
  }
  const year = weekYear(month, w2, w1, w2);
  return { month, w1, w2, year, week: w2, label: weekLabel(year, w2) };
}

export function maxParsedWeek(rows) {
  let best = null;
  for (const row of rows ?? []) {
    if (!row?.week_start) continue;
    if (!best || row.week_start > best.week_start) best = row;
  }
  if (!best) return null;
  return { year: best.year, week: best.week, week_start: best.week_start, label: weekLabel(best.year, best.week) };
}

export function latestBulletinCoverageError(html, rows, url = "") {
  const span = claimedWeekSpan(html);
  if (!span) return null;
  const covered = (rows ?? []).some((r) => r.year === span.year && Number(r.week) === span.week);
  if (covered) return null;
  const latest = maxParsedWeek(rows);
  const where = url ? ` (${url})` : "";
  return `newest variant bulletin claims ${span.label} but parsed shares stop at ${latest?.label ?? "none"}${where}`;
}

export function variantCrawlBlocksSync(section) {
  if (!section || section.crawl === "ok") return false;
  const err = String(section.error ?? "");
  return /parsed 0 rows|parsed shares stop at|no fetchable link|no variant rows/.test(err);
}

export function parseBulletin(html, sourceUrl) {
  const compactHtml = compact(html);
  const month = extractMonth(compactHtml);
  if (!month) return [];
  const section = variantSection(compactHtml);
  if (!section) return [];
  const { start, chunk } = section;

  const sequences = Number((chunk.match(/报送(\d+)例/) || [])[1] || "") || "";
  const ranges = rangesIn(compactHtml);

  const rows = [];
  for (const m of chunk.matchAll(shareRe())) {
    const lineage = canonLineage(m[1]);
    const values = parsePercents(m[2]);
    if (!lineage || values.length === 0) continue;
    const pctAt = start + (m.index ?? 0) + m[1].length;
    const range = resolveRange(compactHtml, ranges, pctAt);
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

function isVariantHref(href) {
  if (href.includes("..")) return false;
  return (
    /^(?:\.\/)?\d{6}\/t[^"'?#]+\.html$/.test(href) ||
    /\/jksj\/xgbdyq\/\d{6}\/t[^"'?#]+\.html$/.test(href)
  );
}

export function discoverVariantLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[2].trim();
    if (!isVariantHref(href)) continue;
    const title = m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
    const monthMatch = title.match(/（(\d{4})年(\d{1,2})月）/);
    let url;
    try {
      url = new URL(href, base).href;
    } catch {
      continue;
    }
    out.push({
      url,
      title,
      month: monthMatch ? `${monthMatch[1]}-${String(Number(monthMatch[2])).padStart(2, "0")}` : "",
    });
  }
  return out;
}

export function unrecognizedBulletinError(html, base) {
  const linked = new Set(discoverVariantLinks(html, base).map((link) => link.month).filter(Boolean));
  const titled = [
    ...String(html).matchAll(/全国新型冠状病毒感染疫情情况（(\d{4})年(\d{1,2})月）/g),
  ].map((m) => `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`);
  if (titled.length === 0) return null;
  const newest = titled.sort().at(-1);
  if (!linked.has(newest)) {
    return `listing shows variant bulletin ${newest} but no fetchable link was recognized`;
  }
  return null;
}

export async function listBulletins() {
  const found = [];
  for (let i = 0; i < 8; i++) {
    const url = i === 0 ? LISTING : `${LISTING}index_${i}.html`;
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      if (String(err.message).includes("404")) break;
      throw err;
    }
    if (i === 0) {
      const blind = unrecognizedBulletinError(html, url);
      if (blind) throw new Error(blind);
    }
    const links = discoverVariantLinks(html, url);
    if (links.length === 0) {
      if (i === 0 && found.length === 0) throw new Error("variant listing: 0 bulletin links");
      break;
    }
    found.push(...links);
    await delay(250);
  }
  const seen = new Set();
  const out = [];
  for (const link of found) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
  }
  if (out.length === 0) throw new Error("variant listing: 0 bulletin links");
  return out;
}

function variantSortKey(url) {
  const m = String(url).match(/\/(\d{6})\//);
  return m ? m[1] : "";
}

function newestLinksFirst(links) {
  return [...links].sort((a, b) => {
    const byMonth = (b.month || "").localeCompare(a.month || "");
    if (byMonth !== 0) return byMonth;
    return variantSortKey(b.url).localeCompare(variantSortKey(a.url));
  });
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
  const links = newestLinksFirst(await listBulletins());
  const all = [];
  for (let i = 0; i < links.length; i++) {
    const url = links[i].url;
    const latest = i === 0;
    try {
      const html = await fetchText(url);
      const rows = parseBulletin(html, url);
      if (latest) {
        const coverage = latestBulletinCoverageError(html, rows, url);
        if (rows.length === 0) {
          throw new Error(coverage ?? `latest variant bulletin parsed 0 rows: ${url}`);
        }
        if (coverage) throw new Error(coverage);
      } else if (rows.length === 0) {
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
