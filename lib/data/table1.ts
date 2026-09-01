import { PATHOGENS } from "@/lib/pathogens";
import type { SurveillanceRecord } from "@/lib/data/parse";
import { weekLabel } from "@/lib/data/parse";

export type Table1Row = {
  pathogen: string;
  ili: number | null;
  iliDelta: number | null;
  sari: number | null;
  sariDelta: number | null;
};

export type Table1 = {
  reference_date: string;
  target_end_date: string;
  report_week: number;
  weekLabel: string;
  previousLabel: string | null;
  rows: Table1Row[];
};

function delta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  return Math.round((curr - prev) * 10) / 10;
}

export function formatDelta(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value).toFixed(1);
  return value > 0 ? `+${abs}` : `-${abs}`;
}

export function formatRate(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(1);
}

export function buildTable1(records: SurveillanceRecord[]): Table1 | null {
  const dates = [...new Set(records.map((r) => r.reference_date))].sort();
  if (dates.length === 0) return null;
  const latest = dates[dates.length - 1];
  const previous = dates.length > 1 ? dates[dates.length - 2] : null;
  const latestRows = records.filter((r) => r.reference_date === latest);
  const prevRows = previous ? records.filter((r) => r.reference_date === previous) : [];
  const latestBy = new Map(latestRows.map((r) => [r.pathogen, r]));
  const prevBy = new Map(prevRows.map((r) => [r.pathogen, r]));
  const sample = latestRows[0];
  return {
    reference_date: latest,
    target_end_date: sample?.target_end_date ?? "",
    report_week: sample?.report_week ?? 0,
    weekLabel: weekLabel(latest, sample?.report_week ?? 0),
    previousLabel: previous
      ? weekLabel(previous, prevRows[0]?.report_week ?? 0)
      : null,
    rows: PATHOGENS.map((p) => {
      const cur = latestBy.get(p.name);
      const prev = prevBy.get(p.name);
      return {
        pathogen: p.name,
        ili: cur?.ili_percent ?? null,
        iliDelta: delta(cur?.ili_percent ?? null, prev?.ili_percent ?? null),
        sari: cur?.sari_percent ?? null,
        sariDelta: delta(cur?.sari_percent ?? null, prev?.sari_percent ?? null),
      };
    }),
  };
}
