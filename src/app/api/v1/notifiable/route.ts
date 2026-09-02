import { loadNotifiable } from "@/lib/data/load";
import { toNotifiableCsv } from "@/lib/data/notifiable";
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
  const disease = url.searchParams.get("disease")?.trim();
  const klass = url.searchParams.get("class")?.trim();
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const includeSummary = url.searchParams.get("summary") === "1";

  let records = loadNotifiable();
  if (!includeSummary) records = records.filter((r) => r.row_kind !== "summary");
  if (disease) records = records.filter((r) => r.disease === disease);
  if (klass) records = records.filter((r) => r.disease_class === klass);
  if (start) records = records.filter((r) => r.month >= start);
  if (end) records = records.filter((r) => r.month <= end);

  if (format === "csv") {
    return csvResponse(toNotifiableCsv(records), "notifiable.csv");
  }
  if (format === "parquet") {
    return parquetResponse(csvToParquet(toNotifiableCsv(records)), "notifiable.parquet");
  }
  return jsonResponse({
    source: "china_cdc_jksj01",
    count: records.length,
    records,
  });
}
