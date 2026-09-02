import { weekRange } from "@/lib/data/period";

export type VariantRecord = {
  reference_date: string;
  target_end_date: string;
  year: number;
  week: number;
  week_start: string;
  lineage: string;
  share: number;
  sequences: number | null;
  month: string;
  source_url: string;
};

export const VARIANT_COLORS: Record<string, string> = {
  "JN.1及其亚分支": "#F2C14E",
  "XDV及其亚分支": "#8AAA3A",
  "NB.1.8.1及其亚分支": "#7A5C9E",
  其他: "#C5C5C5",
};

const LINEAGE_ORDER = ["JN.1及其亚分支", "XDV及其亚分支", "NB.1.8.1及其亚分支", "其他"];

export function parseVariantCsv(text: string): VariantRecord[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const rows: VariantRecord[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const share = Number(cols[idx.share]);
    if (!Number.isFinite(share)) continue;
    const sequences = Number(cols[idx.sequences]);
    const week_start = cols[idx.week_start]?.trim() ?? "";
    const range = week_start ? weekRange(week_start) : { reference_date: "", target_end_date: "" };
    rows.push({
      reference_date: cols[idx.reference_date]?.trim() || range.reference_date,
      target_end_date: cols[idx.target_end_date]?.trim() || range.target_end_date,
      year: Number(cols[idx.year]),
      week: Number(cols[idx.week]),
      week_start,
      lineage: cols[idx.lineage]?.trim() ?? "",
      share,
      sequences: Number.isFinite(sequences) ? sequences : null,
      month: cols[idx.month]?.trim() ?? "",
      source_url: cols.slice(idx.source_url).join(",").trim(),
    });
  }
  return rows.sort((a, b) => a.week_start.localeCompare(b.week_start) || a.lineage.localeCompare(b.lineage, "zh"));
}

export function uniqueVariantWeeks(records: VariantRecord[]) {
  const map = new Map<string, { week_start: string; year: number; week: number; label: string }>();
  for (const row of records) {
    if (map.has(row.week_start)) continue;
    map.set(row.week_start, {
      week_start: row.week_start,
      year: row.year,
      week: row.week,
      label: `${row.year}年第${row.week}周`,
    });
  }
  return [...map.values()].sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export function variantLineages(records: VariantRecord[]) {
  const present = new Set(records.map((r) => r.lineage));
  const known = LINEAGE_ORDER.filter((name) => present.has(name));
  const extra = [...present].filter((name) => !LINEAGE_ORDER.includes(name)).sort();
  return [...known, ...extra];
}

export function toVariantCsv(records: VariantRecord[]) {
  const header =
    "reference_date,target_end_date,year,week,week_start,lineage,share,sequences,month,source_url";
  const body = records.map((r) =>
    [
      r.reference_date,
      r.target_end_date,
      r.year,
      r.week,
      r.week_start,
      r.lineage,
      r.share,
      r.sequences ?? "",
      r.month,
      r.source_url,
    ].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
