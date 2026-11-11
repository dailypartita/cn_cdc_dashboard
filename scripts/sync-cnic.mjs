#!/usr/bin/env node
/**
 * Crawl CNIC weekly influenza reports and merge them onto the committed
 * history. Recent HTML pages are summaries; ILI% and the lab table for a
 * new week come from the attached PDF when pdftotext is available.
 * Weeks this crawl does not return stay in data/backfill.
 *
 * Listing: https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/
 * Older listing: https://ivdc.chinacdc.cn/lgzx/zyzx/lgzb/
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { fetchText, CDC_UA } from "./cdc-http.mjs";
import {
  CNIC_ARCHIVE,
  CNIC_CSV,
  assembleCnicRows,
  cnicCoverage,
  loadCnicBackfill,
  loadCnicMain,
  mergeCnicPreferIncoming,
  parseReportText,
  recordsToCsv,
  weekKeyOf,
  writeCnicBackfill,
} from "./cnic-weekly.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_CACHE = join(tmpdir(), "cnic-weekly-cache");

const WEEK_LINK = /<a[^>]+href="([^"]+)"[^>]*>\s*(\d{4})\s*第\s*(\d{1,2})\s*周/gi;

function cacheName(year, week, ext) {
  return `${year}-W${String(week).padStart(2, "0")}.${ext}`;
}

async function readCached(path, fetcher) {
  if (existsSync(path) && readFileSync(path).length > 80) {
    return readFileSync(path);
  }
  const body = await fetcher();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return body;
}

async function fetchHtml(url, cachePath) {
  const body = await readCached(cachePath, async () => Buffer.from(await fetchText(url), "utf8"));
  return body.toString("utf8");
}

export async function collectListing(base, { pages = 40, cacheDir = DEFAULT_CACHE } = {}) {
  const found = [];
  for (let page = 0; page < pages; page++) {
    const url = page === 0 ? base : `${base}index_${page}.htm`;
    let html;
    try {
      html = await fetchHtml(url, join(cacheDir, "index", `${base.includes("/lgzx/") ? "archive" : "current"}-${page}.html`));
    } catch (err) {
      if (page === 0) throw err;
      break;
    }
    const links = [];
    for (const match of html.matchAll(WEEK_LINK)) {
      links.push({
        year: Number(match[2]),
        week: Number(match[3]),
        url: new URL(match[1], url).href,
        listing: base.includes("/lgzx/") ? "archive" : "current",
      });
    }
    if (!links.length) break;
    found.push(...links);
  }
  return found;
}

export function preferListing(links) {
  const byWeek = new Map();
  for (const link of links) {
    const key = weekKeyOf(link.year, link.week);
    const prev = byWeek.get(key);
    if (!prev) {
      byWeek.set(key, { ...link, altUrl: "" });
      continue;
    }
    if (prev.listing !== "current" && link.listing === "current") {
      byWeek.set(key, { ...link, altUrl: prev.url });
    } else if (!prev.altUrl && link.url !== prev.url) {
      prev.altUrl = link.url;
    }
  }
  return [...byWeek.values()].sort((a, b) => a.year - b.year || a.week - b.week);
}

function pdfUrlFrom(html, pageUrl) {
  const match = html.match(/href="([^"]+\.pdf)"/i);
  return match ? new URL(match[1], pageUrl).href : "";
}

async function parsePage(link, cacheDir) {
  const cachePath = join(cacheDir, "html", cacheName(link.year, link.week, "html"));
  let html;
  try {
    html = await fetchHtml(link.url, cachePath);
  } catch (err) {
    return { link, error: err.message, row: null, pdfUrl: "" };
  }
  let row = parseReportText(html, {
    year: link.year,
    week: link.week,
    source_url: link.url,
    extract: "cnic-html",
  });
  let pdfUrl = pdfUrlFrom(html, link.url);
  if ((row?.ili_south == null || row?.ili_north == null) && link.altUrl) {
    try {
      const altHtml = await fetchHtml(link.altUrl, join(cacheDir, "html", cacheName(link.year, link.week, "archive.html")));
      const alt = parseReportText(altHtml, {
        year: link.year,
        week: link.week,
        source_url: link.altUrl,
        extract: "cnic-html",
      });
      if (alt) row = row ? mergeCnicPreferIncoming([alt], [row])[0] ?? row : alt;
      if (!pdfUrl) pdfUrl = pdfUrlFrom(altHtml, link.altUrl);
    } catch {
      // The current listing page is enough when the archive copy fails.
    }
  }
  return { link, row, pdfUrl, error: null };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function pdfToText(bytes) {
  const path = join(tmpdir(), `cnic-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  writeFileSync(path, bytes);
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", path, "-"], { maxBuffer: 20_000_000 });
    return stdout;
  } finally {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(path, { force: true });
    } catch {
      // The temp PDF is only an extraction input.
    }
  }
}

async function fetchPdf(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": CDC_UA, Accept: "application/pdf" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function parsePdfLink(item, cacheDir = DEFAULT_CACHE) {
  const cachePath = join(cacheDir, "pdf", cacheName(item.link.year, item.link.week, "pdf"));
  const textPath = join(cacheDir, "pdf", cacheName(item.link.year, item.link.week, "txt"));
  let text;
  if (existsSync(textPath) && readFileSync(textPath, "utf8").length > 80) {
    text = readFileSync(textPath, "utf8");
  } else {
    const bytes = await readCached(cachePath, () => fetchPdf(item.pdfUrl));
    text = await pdfToText(bytes);
    writeFileSync(textPath, text);
  }
  return parseReportText(text, {
    year: item.link.year,
    week: item.link.week,
    source_url: item.link.url,
    extract: "cnic-pdf",
  });
}

/**
 * @param {object} options
 * @param {number} [options.pages] current-listing pages (20 reports each). 0 walks every page.
 * @param {boolean} [options.archive] also walk the pre-2016 listing
 * @param {boolean} [options.pdf] download PDFs when HTML has no ILI%
 * @param {number} [options.pdfLimit]
 */
export async function crawlCnicPages({
  pages = 2,
  archive = false,
  concurrency = 6,
  cacheDir = DEFAULT_CACHE,
} = {}) {
  const pageCount = pages > 0 ? pages : 40;
  const links = await collectListing("https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/", { pages: pageCount, cacheDir });
  if (archive) {
    links.push(...(await collectListing(CNIC_ARCHIVE, { pages: 40, cacheDir })));
  }
  const chosen = preferListing(links);
  if (!chosen.length) throw new Error("no CNIC weekly links");
  console.log(
    "cnic links",
    chosen.length,
    weekKeyOf(chosen[0].year, chosen[0].week),
    "..",
    weekKeyOf(chosen.at(-1).year, chosen.at(-1).week),
  );
  const parsed = await mapPool(chosen, concurrency, async (link, index) => {
    if (index > 0 && index % 50 === 0) console.log("cnic html", index, "/", chosen.length);
    return parsePage(link, cacheDir);
  });
  const failed = parsed.filter((item) => item.error);
  if (failed.length) console.log("cnic html failed", failed.length);
  if (failed.length > Math.max(8, chosen.length * 0.15)) {
    throw new Error(`CNIC html fetch failed for ${failed.length}/${chosen.length} reports`);
  }
  return parsed;
}

export async function parseMissingPdfs(parsed, { cacheDir = DEFAULT_CACHE, pdfLimit = 8, rows = [] } = {}) {
  const haveIli = new Set(rows.filter((row) => row.ili_south != null && row.ili_north != null).map((row) => weekKeyOf(row.year, row.week)));
  const need = parsed
    .filter((item) => item.pdfUrl && !haveIli.has(weekKeyOf(item.link.year, item.link.week)))
    .slice(0, pdfLimit);
  const pdfRows = (
    await mapPool(need, 3, async (item) => {
      try {
        return await parsePdfLink(item, cacheDir);
      } catch (err) {
        console.log("cnic pdf skip", weekKeyOf(item.link.year, item.link.week), err.message);
        return null;
      }
    })
  ).filter(Boolean);
  if (need.length) console.log("cnic pdf parsed", pdfRows.length, "/", need.length);
  return pdfRows;
}

export async function crawlCnic({
  pages = 2,
  archive = false,
  pdf = true,
  pdfLimit = 8,
  concurrency = 6,
  cacheDir = DEFAULT_CACHE,
} = {}) {
  const parsed = await crawlCnicPages({ pages, archive, concurrency, cacheDir });
  let fresh = parsed.map((item) => item.row).filter(Boolean);
  if (pdf) {
    const pdfRows = await parseMissingPdfs(parsed, { cacheDir, pdfLimit, rows: fresh });
    fresh = mergeCnicPreferIncoming(fresh, pdfRows);
  }
  return fresh;
}

export function writeOutputs(fresh = []) {
  const backfill = loadCnicBackfill();
  const existing = loadCnicMain();
  const merged = assembleCnicRows({ backfill, existing, fresh });
  const text = recordsToCsv(merged);
  mkdirSync(dirname(CNIC_CSV), { recursive: true });
  const changed = !existsSync(CNIC_CSV) || readFileSync(CNIC_CSV, "utf8") !== text;
  if (changed) writeFileSync(CNIC_CSV, text);
  writeCnicBackfill(mergeCnicPreferIncoming(backfill, fresh));
  const coverage = cnicCoverage(merged);
  return { rows: merged.length, changed, coverage };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const fresh = await crawlCnic({ pages: 2, pdf: true, pdfLimit: 8 });
  const result = writeOutputs(fresh);
  console.log(
    "cnic",
    result.coverage.ili?.first_key,
    "..",
    result.coverage.ili?.last_key,
    "ili weeks",
    result.coverage.ili?.weeks,
    "rows",
    result.rows,
    result.changed ? "updated" : "unchanged",
  );
}
