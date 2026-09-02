import { loadNotifiable } from "@/lib/data/load";
import { toNotifiableCsv } from "@/lib/data/notifiable";
import { fileFormat, tableFileResponse } from "@/lib/data/parquet";
import { jsonResponse, optionsResponse } from "@/lib/api/http";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ month: string }> },
) {
  const { month: raw } = await context.params;
  const format = fileFormat(raw);
  const month = raw.replace(/\.(csv|parquet)$/i, "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return jsonResponse({ error: "unknown month" }, 404);
  }
  const records = loadNotifiable().filter((row) => row.month === month);
  if (records.length === 0) return jsonResponse({ error: "unknown month" }, 404);
  return tableFileResponse(toNotifiableCsv(records), `${month}.csv`, format);
}
