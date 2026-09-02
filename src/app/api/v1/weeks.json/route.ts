import { loadAll } from "@/lib/data/load";
import { uniqueWeeks } from "@/lib/data/parse";

export const dynamic = "force-static";

export function GET() {
  const weeks = uniqueWeeks(loadAll());
  return Response.json({
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
