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
  cases: number;
  deaths: number;
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
      cases: Number(cols[idx.cases]) || 0,
      deaths: Number(cols[idx.deaths]) || 0,
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

export function chartableDiseases(records: NotifiableRecord[]): string[] {
  const latest = uniqueMonths(records).at(-1)?.month;
  const latestRows = latest ? records.filter((r) => r.month === latest && r.row_kind !== "summary") : [];
  const ordered = latestRows
    .slice()
    .sort((a, b) => b.cases - a.cases)
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
      r.cases,
      r.deaths,
      r.source_url,
    ].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
