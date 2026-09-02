import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadAll, loadCovid, loadCovidVariants, loadNotifiable } from "@/lib/data/load";
import { uniqueMonths } from "@/lib/data/notifiable";
import { uniqueWeeks } from "@/lib/data/parse";
import { uniqueVariantWeeks } from "@/lib/data/covid-variants";

export type DataStatus = {
  synced_at: string | null;
  sentinel: ReturnType<typeof uniqueWeeks>[number] | null;
  notifiable: ReturnType<typeof uniqueMonths>[number] | null;
  covid: ReturnType<typeof uniqueWeeks>[number] | null;
  covidVariants: ReturnType<typeof uniqueVariantWeeks>[number] | null;
  weekCount: number;
  monthCount: number;
  covidWeekCount: number;
  variantWeekCount: number;
};

function readSyncedAt(): string | null {
  const path = join(process.cwd(), "data", "catalog.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { synced_at?: string };
    return raw.synced_at ?? null;
  } catch {
    return null;
  }
}

/** Latest periods from the CSVs currently on disk. TOC dates follow this. */
export function dataStatus(): DataStatus {
  const weeks = uniqueWeeks(loadAll());
  const months = uniqueMonths(loadNotifiable());
  const covidWeeks = uniqueWeeks(loadCovid());
  const variantWeeks = uniqueVariantWeeks(loadCovidVariants());
  return {
    synced_at: readSyncedAt(),
    sentinel: weeks.at(-1) ?? null,
    notifiable: months.at(-1) ?? null,
    covid: covidWeeks.at(-1) ?? null,
    covidVariants: variantWeeks.at(-1) ?? null,
    weekCount: weeks.length,
    monthCount: months.length,
    covidWeekCount: covidWeeks.length,
    variantWeekCount: variantWeeks.length,
  };
}
