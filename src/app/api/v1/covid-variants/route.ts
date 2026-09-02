import { loadCovidVariants } from "@/lib/data/load";
import { toVariantCsv } from "@/lib/data/covid-variants";
import { csvResponse, jsonResponse, optionsResponse, parquetResponse } from "@/lib/api/http";
import { csvToParquet } from "@/lib/data/parquet";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const lineage = url.searchParams.get("lineage")?.trim();
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  let records = loadCovidVariants();
  if (lineage) records = records.filter((r) => r.lineage.includes(lineage));
  if (start) records = records.filter((r) => r.week_start >= start);
  if (end) records = records.filter((r) => r.week_start <= end);

  if (format === "csv") {
    return csvResponse(toVariantCsv(records), "covid_variants.csv");
  }
  if (format === "parquet") {
    return parquetResponse(csvToParquet(toVariantCsv(records)), "covid_variants.parquet");
  }
  return jsonResponse({
    source: "china_cdc_xgbdyq",
    count: records.length,
    records,
  });
}
