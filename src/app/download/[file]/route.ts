import { readDownloadFile, loadNotifiable, loadCovidVariants } from "@/lib/data/load";
import { toNotifiableCsv } from "@/lib/data/notifiable";
import { toVariantCsv } from "@/lib/data/covid-variants";
import { fileFormat, tableFileResponse } from "@/lib/data/parquet";
import { jsonResponse, optionsResponse } from "@/lib/api/http";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const format = fileFormat(file);
  const csvName = file.replace(/\.parquet$/i, ".csv");
  if (csvName === "notifiable_all.csv") {
    return tableFileResponse(toNotifiableCsv(loadNotifiable()), csvName, format);
  }
  if (csvName === "covid_variants.csv") {
    return tableFileResponse(toVariantCsv(loadCovidVariants()), csvName, format);
  }
  const body = readDownloadFile(csvName);
  if (body == null) {
    return jsonResponse({ error: "unknown file" }, 404);
  }
  return tableFileResponse(body, csvName, format);
}
