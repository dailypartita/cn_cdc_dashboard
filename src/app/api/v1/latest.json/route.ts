import { loadAll } from "@/lib/data/load";
import { buildTable1, formatDelta, formatRate } from "@/lib/data/table1";

export const dynamic = "force-static";

export function GET() {
  const table = buildTable1(loadAll());
  if (!table) return Response.json({ error: "no data" }, { status: 404 });
  return Response.json({
    week: table.weekLabel,
    reference_date: table.reference_date,
    target_end_date: table.target_end_date,
    report_week: table.report_week,
    rows: table.rows.map((r) => ({
      pathogen: r.pathogen,
      ili_percent: r.ili,
      ili_delta: r.iliDelta,
      ili_delta_label: formatDelta(r.iliDelta),
      ili_label: formatRate(r.ili),
      sari_percent: r.sari,
      sari_delta: r.sariDelta,
      sari_delta_label: formatDelta(r.sariDelta),
      sari_label: formatRate(r.sari),
    })),
  });
}
