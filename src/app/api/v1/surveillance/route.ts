import { loadAll } from "@/lib/data/load";
import { toCsv, type SurveillanceRecord } from "@/lib/data/parse";
import { resolvePathogen } from "@/lib/pathogens";
import { csvResponse, jsonResponse, optionsResponse, parquetResponse } from "@/lib/api/http";
import { csvToParquet } from "@/lib/data/parquet";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

function filterRecords(
  records: SurveillanceRecord[],
  params: { pathogen?: string | null; start?: string | null; end?: string | null },
) {
  let out = records;
  const pathogen = resolvePathogen(params.pathogen ?? null);
  if (params.pathogen && !pathogen) {
    return { error: `unknown pathogen: ${params.pathogen}` as const, records: [] };
  }
  if (pathogen) out = out.filter((r) => r.pathogen === pathogen.name);
  if (params.start) out = out.filter((r) => r.reference_date >= params.start!);
  if (params.end) out = out.filter((r) => r.reference_date <= params.end!);
  return { records: out };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const result = filterRecords(loadAll(), {
    pathogen: url.searchParams.get("pathogen"),
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
  });
  if ("error" in result && result.error) {
    return jsonResponse({ error: result.error }, 400);
  }
  if (format === "csv") {
    return csvResponse(toCsv(result.records), "cncdc_surveillance.csv");
  }
  if (format === "parquet") {
    return parquetResponse(csvToParquet(toCsv(result.records)), "cncdc_surveillance.parquet");
  }
  return jsonResponse({
    source: "china_cdc_jksj04",
    count: result.records.length,
    records: result.records,
  });
}
