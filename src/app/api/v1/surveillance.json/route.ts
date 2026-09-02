import { loadAll } from "@/lib/data/load";

export const dynamic = "force-static";

export function GET() {
  const records = loadAll();
  return Response.json({
    source: "china_cdc_jksj04",
    count: records.length,
    records,
  });
}
