import { isoWeekYear, weekKey, weekLabel, type WeekAxis } from "@/lib/data/parse";

export type CnicWeek = {
  reference_date: string;
  target_end_date: string;
  year: number;
  week: number;
  ili_south: number | null;
  ili_north: number | null;
  positivity_south: number | null;
  positivity_north: number | null;
  positivity_national: number | null;
  positives_national: number | null;
  h1_national: number | null;
  h3_national: number | null;
  bvic_national: number | null;
  byam_national: number | null;
  source_url: string;
  ili_extract: string;
  lab_extract: string;
};

const NUMERIC = [
  "ili_south",
  "ili_north",
  "positivity_south",
  "positivity_north",
  "positivity_national",
  "positives_national",
  "h1_national",
  "h3_national",
  "bvic_national",
  "byam_national",
] as const;

function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseCnicCsv(text: string): CnicWeek[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((cell) => cell.trim());
  const index = new Map(header.map((name, i) => [name, i]));
  const rows: CnicWeek[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const cell = (name: string) => cols[index.get(name) ?? -1];
    const reference_date = cell("reference_date")?.trim() ?? "";
    const year = Number(cell("year")) || 0;
    const week = Number(cell("week")) || 0;
    if (!reference_date || !year || !week) continue;
    const row = {
      reference_date,
      target_end_date: cell("target_end_date")?.trim() ?? "",
      year,
      week,
      source_url: cell("source_url")?.trim() ?? "",
      ili_extract: cell("ili_extract")?.trim() ?? "",
      lab_extract: cell("lab_extract")?.trim() ?? "",
    } as CnicWeek;
    for (const name of NUMERIC) row[name] = parseNumber(cell(name));
    rows.push(row);
  }
  rows.sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  return rows;
}

export function cnicWeekAxis(row: CnicWeek): WeekAxis {
  return {
    reference_date: row.reference_date,
    target_end_date: row.target_end_date,
    report_week: row.week,
    year: row.year,
    key: weekKey(row.reference_date, row.week),
    label: weekLabel(row.reference_date, row.week),
  };
}

export function shareOfPositives(count: number | null, positives: number | null): number | null {
  if (count == null || positives == null || positives <= 0) return null;
  return Math.round((count / positives) * 1000) / 10;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type CnicSpan = {
  first: WeekAxis;
  last: WeekAxis;
  count: number;
  gaps: string[];
};

/** Weeks inside the first-to-last span where the metric is missing. */
export function cnicSpan(rows: CnicWeek[], has: (row: CnicWeek) => boolean): CnicSpan | null {
  const kept = rows.filter(has);
  if (!kept.length) return null;
  const byDate = new Map(rows.map((row) => [row.reference_date, row]));
  const missing: string[] = [];
  for (let cursor = kept[0].reference_date; cursor <= kept[kept.length - 1].reference_date; cursor = addDays(cursor, 7)) {
    const row = byDate.get(cursor);
    if (!row || !has(row)) missing.push(cursor);
  }
  const gaps: string[] = [];
  let start = missing[0];
  let prev = missing[0];
  const labelFor = (date: string) => {
    const row = byDate.get(date);
    if (row) return weekLabel(row.reference_date, row.week);
    const [y, m, d] = date.split("-").map(Number);
    const dateUtc = new Date(Date.UTC(y, m - 1, d));
    dateUtc.setUTCDate(dateUtc.getUTCDate() + 4 - (dateUtc.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(dateUtc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((dateUtc.getTime() - yearStart.getTime()) / 86400000 / 7 + 1 / 7);
    return `${isoWeekYear(date)}年第${week}周`;
  };
  const push = (from: string | undefined, to: string | undefined) => {
    if (!from || !to) return;
    const a = labelFor(from);
    const b = labelFor(to);
    gaps.push(a === b ? a : `${a}–${b}`);
  };
  for (const date of missing.slice(1)) {
    if (date === addDays(prev, 7)) prev = date;
    else {
      push(start, prev);
      start = date;
      prev = date;
    }
  }
  push(start, prev);
  return {
    first: cnicWeekAxis(kept[0]),
    last: cnicWeekAxis(kept[kept.length - 1]),
    count: kept.length,
    gaps,
  };
}

export function hasIli(row: CnicWeek): boolean {
  return row.ili_south != null || row.ili_north != null;
}

export function hasPositivity(row: CnicWeek): boolean {
  return row.positivity_south != null || row.positivity_north != null || row.positivity_national != null;
}
