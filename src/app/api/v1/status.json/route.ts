import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataStatus } from "@/lib/data/status";

export const dynamic = "force-static";

type CatalogSection = {
  crawl?: string;
  error?: string | null;
  unchanged?: boolean;
  synced_at?: string | null;
};

type CatalogFile = {
  synced_at?: string;
  sentinel?: CatalogSection;
  notifiable?: CatalogSection;
  covid_variants?: CatalogSection;
  covid_positivity?: CatalogSection;
};

function readCatalog(): CatalogFile | null {
  const path = join(process.cwd(), "data", "catalog.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CatalogFile;
  } catch {
    return null;
  }
}

function crawlMeta(section?: CatalogSection) {
  if (!section) return {};
  return {
    crawl: section.crawl ?? null,
    crawl_error: section.error ?? null,
    unchanged: section.unchanged ?? null,
    dataset_synced_at: section.synced_at ?? null,
  };
}

export function GET() {
  const status = dataStatus();
  const catalog = readCatalog();
  return Response.json({
    synced_at: status.synced_at,
    sentinel: status.sentinel
      ? {
          key: status.sentinel.key,
          label: status.sentinel.label,
          reference_date: status.sentinel.reference_date,
          target_end_date: status.sentinel.target_end_date,
          weeks: status.weekCount,
          ...crawlMeta(catalog?.sentinel),
        }
      : null,
    notifiable: status.notifiable
      ? {
          month: status.notifiable.month,
          label: status.notifiable.label,
          months: status.monthCount,
          ...crawlMeta(catalog?.notifiable),
        }
      : null,
    covid_positivity: status.covid
      ? {
          key: status.covid.key,
          label: status.covid.label,
          reference_date: status.covid.reference_date,
          target_end_date: status.covid.target_end_date,
          weeks: status.covidWeekCount,
          ...crawlMeta(catalog?.covid_positivity),
        }
      : null,
    covid_variants: status.covidVariants
      ? {
          week_start: status.covidVariants.week_start,
          label: status.covidVariants.label,
          weeks: status.variantWeekCount,
          ...crawlMeta(catalog?.covid_variants),
        }
      : null,
  });
}
