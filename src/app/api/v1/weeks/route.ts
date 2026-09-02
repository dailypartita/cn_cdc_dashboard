import { loadAll } from "@/lib/data/load";
import { uniqueWeeks } from "@/lib/data/parse";
import { jsonResponse, optionsResponse } from "@/lib/api/http";
import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export function GET() {
  const weeks = uniqueWeeks(loadAll());
  return jsonResponse({
    count: weeks.length,
    weeks: weeks.map((w) => ({
      key: w.key,
      label: w.label,
      reference_date: w.reference_date,
      target_end_date: w.target_end_date,
      report_week: w.report_week,
      year: w.year,
    })),
  });
}
