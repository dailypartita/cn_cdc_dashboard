import { monthRange } from "@/lib/data/period";

export type NotifiableRowKind = "summary" | "group" | "disease";

export type NotifiableRecord = {
  reference_date: string;
  target_end_date: string;
  month: string;
  label: string;
  report_date: string;
  disease: string;
  disease_class: string;
  row_kind: NotifiableRowKind;
  cases: number | null;
  deaths: number | null;
  source_url: string;
};

export const MAIN_NOTIFIABLE = [
  "新型冠状病毒感染",
  "流行性感冒",
  "手足口病",
  "病毒性肝炎",
  "肺结核",
  "其他感染性腹泻病",
] as const;

const PALETTE = [
  "#2E75B6",
  "#ED7D31",
  "#70AD47",
  "#C00000",
  "#9B59B6",
  "#00B0F0",
  "#FFC000",
  "#833C0C",
  "#5B9BD5",
  "#00B050",
  "#7F7F7F",
  "#C65911",
];

const FIXED_COLOR: Record<string, string> = {
  新型冠状病毒感染: "#2E75B6",
  流行性感冒: "#ED7D31",
  手足口病: "#70AD47",
  病毒性肝炎: "#9B59B6",
  肺结核: "#833C0C",
  其他感染性腹泻病: "#C00000",
  梅毒: "#00B0F0",
  水痘: "#FFC000",
  艾滋病: "#7F7F7F",
};

export function colorForDisease(name: string): string {
  if (FIXED_COLOR[name]) return FIXED_COLOR[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function parseCount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Inclusive YYYY-MM span. Missing months stay in the list so charts can break the line. */
export function calendarMonths(start: string, end: string): string[] {
  const out: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
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

export function parseNotifiableCsv(text: string): NotifiableRecord[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    reference_date: header.indexOf("reference_date"),
    target_end_date: header.indexOf("target_end_date"),
    month: header.indexOf("month"),
    report_date: header.indexOf("report_date"),
    disease: header.indexOf("disease"),
    disease_class: header.indexOf("disease_class"),
    row_kind: header.indexOf("row_kind"),
    cases: header.indexOf("cases"),
    deaths: header.indexOf("deaths"),
    source_url: header.indexOf("source_url"),
  };
  const rows: NotifiableRecord[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const month = cols[idx.month]?.trim();
    const disease = cols[idx.disease]?.trim();
    if (!month || !disease) continue;
    const kind = cols[idx.row_kind]?.trim() as NotifiableRowKind;
    const range = monthRange(month);
    rows.push({
      reference_date: cols[idx.reference_date]?.trim() || range.reference_date,
      target_end_date: cols[idx.target_end_date]?.trim() || range.target_end_date,
      month,
      label: monthLabel(month),
      report_date: cols[idx.report_date]?.trim() ?? "",
      disease,
      disease_class: cols[idx.disease_class]?.trim() ?? "",
      row_kind: kind === "summary" || kind === "group" ? kind : "disease",
      cases: parseCount(cols[idx.cases]),
      deaths: parseCount(cols[idx.deaths]),
      source_url: cols[idx.source_url]?.trim() ?? "",
    });
  }
  rows.sort((a, b) => {
    const d = a.month.localeCompare(b.month);
    if (d !== 0) return d;
    return a.disease.localeCompare(b.disease, "zh");
  });
  return rows;
}

export function uniqueMonths(records: NotifiableRecord[]): { month: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    if (!seen.has(r.month)) seen.set(r.month, r.label);
  }
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, label]) => ({ month, label }));
}

/** X axis for the diseases on the chart, with calendar holes kept as empty ticks. */
export function axisMonths(
  records: NotifiableRecord[],
  selected: string[],
): { month: string; label: string }[] {
  const all = uniqueMonths(records);
  if (!all.length) return [];
  const names = new Set(selected);
  const present = records
    .filter((row) => names.has(row.disease) && row.row_kind !== "summary")
    .map((row) => row.month);
  if (!present.length) return all;
  const start = present.reduce((min, month) => (month < min ? month : min));
  return calendarMonths(start, all[all.length - 1].month).map((month) => ({
    month,
    label: monthLabel(month),
  }));
}

export function diseaseCoverage(records: NotifiableRecord[], disease: string) {
  const months = [...new Set(records.filter((row) => row.disease === disease).map((row) => row.month))].sort();
  const first = months[0] ?? "";
  const last = months[months.length - 1] ?? "";
  const present = new Set(months);
  const gaps = first && last ? calendarMonths(first, last).filter((month) => !present.has(month)) : [];
  return { first, last, count: months.length, gaps };
}

export function chartableDiseases(records: NotifiableRecord[]): string[] {
  const latest = uniqueMonths(records).at(-1)?.month;
  const latestRows = latest ? records.filter((r) => r.month === latest && r.row_kind !== "summary") : [];
  const ordered = latestRows
    .slice()
    .sort((a, b) => (b.cases ?? -1) - (a.cases ?? -1))
    .map((r) => r.disease);
  const rest = [...new Set(records.filter((r) => r.row_kind !== "summary").map((r) => r.disease))].filter(
    (name) => !ordered.includes(name),
  );
  return [...ordered, ...rest];
}

export function toNotifiableCsv(records: NotifiableRecord[]): string {
  const header =
    "reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,cases,deaths,source_url";
  const body = records.map((r) =>
    [
      r.reference_date,
      r.target_end_date,
      r.month,
      r.report_date,
      r.disease,
      r.disease_class,
      r.row_kind,
      r.cases ?? "",
      r.deaths ?? "",
      r.source_url,
    ].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
