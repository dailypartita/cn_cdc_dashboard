import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDownloadFile, type DataFileName } from "@/lib/data/files";
import { parseCsv, type SurveillanceRecord } from "@/lib/data/parse";
import { parseNotifiableCsv, type NotifiableRecord } from "@/lib/data/notifiable";
import { parseVariantCsv, type VariantRecord } from "@/lib/data/covid-variants";

export const DATA_DIR = join(process.cwd(), "data");

export function readDataFile(name: DataFileName | "notifiable_all.csv" | "covid_variants.csv"): string {
  return readFileSync(join(DATA_DIR, name), "utf8");
}

export function loadAll(): SurveillanceRecord[] {
  return parseCsv(readDataFile("cncdc_surveillance_all.csv"));
}

export function loadCovid(): SurveillanceRecord[] {
  try {
    return parseCsv(readDataFile("cncdc_surveillance_covid19.csv"));
  } catch {
    return loadAll().filter((r) => r.pathogen === "新型冠状病毒");
  }
}

export function loadNotifiable(): NotifiableRecord[] {
  return parseNotifiableCsv(readDataFile("notifiable_all.csv"));
}

export function loadCovidVariants(): VariantRecord[] {
  try {
    return parseVariantCsv(readDataFile("covid_variants.csv"));
  } catch {
    return [];
  }
}

export function readDownloadFile(name: string): string | null {
  if (!isDownloadFile(name)) return null;
  return readDataFile(name);
}
