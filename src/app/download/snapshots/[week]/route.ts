import { loadAll } from "@/lib/data/load";
import { toCsv, uniqueWeeks } from "@/lib/data/parse";
import { fileFormat, tableFileResponse } from "@/lib/data/parquet";
import { jsonResponse, optionsResponse } from "@/lib/api/http";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ week: string }> },
) {
  const { week: raw } = await context.params;
  const format = fileFormat(raw);
  const key = raw.replace(/\.(csv|parquet)$/i, "").toUpperCase();
  const records = loadAll();
  const weeks = uniqueWeeks(records);
  const week = weeks.find((w) => w.key === key);
  if (!week) return jsonResponse({ error: "unknown week" }, 404);
  const rows = records.filter((r) => r.reference_date === week.reference_date);
  return tableFileResponse(toCsv(rows), `${week.key}.csv`, format);
}
