import { chartDownloadByFileParam, buildChartCsv } from "@/lib/data/chart-csv";
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
  const item = chartDownloadByFileParam(file);
  if (!item) return jsonResponse({ error: "unknown chart" }, 404);
  return tableFileResponse(buildChartCsv(item.id), item.filename, fileFormat(file));
}
