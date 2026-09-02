export type SurveillanceRecord = {
  reference_date: string;
  target_end_date: string;
  report_week: number;
  pathogen: string;
  ili_percent: number | null;
  sari_percent: number | null;
};

export type Metric = "ili" | "sari";

export function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseCsv(text: string): SurveillanceRecord[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    reference_date: header.indexOf("reference_date"),
    target_end_date: header.indexOf("target_end_date"),
    report_week: header.indexOf("report_week"),
    pathogen: header.indexOf("pathogen"),
    ili_percent: header.indexOf("ili_percent"),
    sari_percent: header.indexOf("sari_percent"),
  };
  const rows: SurveillanceRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const pathogen = cols[idx.pathogen]?.trim();
    const reference_date = cols[idx.reference_date]?.trim();
    if (!pathogen || !reference_date) continue;
    rows.push({
      reference_date,
      target_end_date: cols[idx.target_end_date]?.trim() ?? "",
      report_week: Number(cols[idx.report_week]) || 0,
      pathogen,
      ili_percent: parseNumber(cols[idx.ili_percent]),
      sari_percent: parseNumber(cols[idx.sari_percent]),
    });
  }
  rows.sort((a, b) => {
    const d = a.reference_date.localeCompare(b.reference_date);
    if (d !== 0) return d;
    return a.pathogen.localeCompare(b.pathogen, "zh");
  });
  return rows;
}

export function toCsv(records: SurveillanceRecord[]): string {
  const header = "reference_date,target_end_date,report_week,pathogen,ili_percent,sari_percent";
  const body = records.map((r) =>
    [
      r.reference_date,
      r.target_end_date,
      r.report_week,
      r.pathogen,
      r.ili_percent ?? "",
      r.sari_percent ?? "",
    ].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}

/** ISO week-year: Thursday of the Monday-start surveillance week. */
export function isoWeekYear(referenceDate: string): number {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 3);
  return date.getUTCFullYear();
}

export function weekLabel(referenceDate: string, reportWeek: number): string {
  return `${isoWeekYear(referenceDate)}年第${reportWeek}周`;
}

export function weekKey(referenceDate: string, reportWeek: number): string {
  return `${isoWeekYear(referenceDate)}-W${String(reportWeek).padStart(2, "0")}`;
}

export type WeekAxis = {
  reference_date: string;
  target_end_date: string;
  report_week: number;
  year: number;
  key: string;
  label: string;
};

export function uniqueWeeks(records: SurveillanceRecord[]): WeekAxis[] {
  const map = new Map<string, WeekAxis>();
  for (const r of records) {
    if (map.has(r.reference_date)) continue;
    const year = isoWeekYear(r.reference_date);
    map.set(r.reference_date, {
      reference_date: r.reference_date,
      target_end_date: r.target_end_date,
      report_week: r.report_week,
      year,
      key: weekKey(r.reference_date, r.report_week),
      label: weekLabel(r.reference_date, r.report_week),
    });
  }
  return [...map.values()].sort((a, b) => a.reference_date.localeCompare(b.reference_date));
}

export function metricValue(r: SurveillanceRecord, metric: Metric): number | null {
  return metric === "ili" ? r.ili_percent : r.sari_percent;
}

/** Defense in depth after scripts/qa-data.mjs; real flu peaks stay on-axis. */
export function isAxisOutlier(pathogen: string, value: number | null): boolean {
  if (value == null) return false;
  if (value >= 70) return true;
  return pathogen === "鼻病毒" && value > 25;
}

export function yAxisMax(values: { pathogen: string; value: number | null }[]): number {
  const kept = values
    .filter((v) => v.value != null && !isAxisOutlier(v.pathogen, v.value))
    .map((v) => v.value as number);
  const m = kept.length ? Math.max(...kept) : 5;
  return Math.max(5, Math.ceil((m * 1.08) / 5) * 5);
}

export function sliceWeeks<T extends { reference_date: string }>(
  weeks: T[],
  window: 26 | 52 | "all",
): T[] {
  if (window === "all") return weeks;
  return weeks.slice(Math.max(0, weeks.length - window));
}

export type TimeWindow = 26 | 52 | "all";
export type SmoothWindow = 1 | 3 | 5;

/** Trailing mean; nulls are skipped. Window 1 returns the original series. */
export function trailingMean(
  values: (number | null)[],
  window: number,
  decimals = 1,
): (number | null)[] {
  if (window <= 1) return values;
  const factor = 10 ** decimals;
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    let n = 0;
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      sum += v;
      n += 1;
    }
    if (n === 0) return null;
    return Math.round((sum / n) * factor) / factor;
  });
}

export function seriesByPathogen(
  records: SurveillanceRecord[],
  weeks: WeekAxis[],
  metric: Metric,
  pathogens: { name: string; color: string; symbol: string }[],
): { name: string; color: string; symbol: string; data: (number | null)[] }[] {
  const byKey = new Map<string, number | null>();
  for (const r of records) {
    byKey.set(`${r.reference_date}|${r.pathogen}`, metricValue(r, metric));
  }
  return pathogens.map((p) => ({
    name: p.name,
    color: p.color,
    symbol: p.symbol,
    data: weeks.map((w) => byKey.get(`${w.reference_date}|${p.name}`) ?? null),
  }));
}
