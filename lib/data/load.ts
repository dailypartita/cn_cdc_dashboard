import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES, type DataFileName } from "@/lib/pathogens";
import { parseCsv, type SurveillanceRecord } from "@/lib/data/parse";

export const DATA_DIR = join(process.cwd(), "data");

export function readDataFile(name: DataFileName): string {
  return readFileSync(join(DATA_DIR, name), "utf8");
}

export function loadAll(): SurveillanceRecord[] {
  return parseCsv(readDataFile("cncdc_surveillance_all.csv"));
}

export function loadCovid19(): SurveillanceRecord[] {
  return parseCsv(readDataFile("cncdc_surveillance_covid19.csv"));
}

export function loadGap(): SurveillanceRecord[] {
  return parseCsv(readDataFile("cncdc_suverillance_2025_14_22.csv"));
}

export function loadNamed(name: DataFileName): SurveillanceRecord[] {
  return parseCsv(readDataFile(name));
}

export const CRAWL_SOURCE =
  "https://github.com/dailypartita/cn_cdc_crawl";

export const CDC_BULLETINS =
  "https://www.chinacdc.cn/jksj/jksj04_14275/";
