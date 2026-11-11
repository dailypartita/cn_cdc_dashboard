import { loadNotifiable } from "@/lib/data/load";

export const dynamic = "force-static";

export function GET() {
  const records = loadNotifiable().filter((r) => r.row_kind !== "summary");
  return Response.json({
    source: "china_cdc_jksj01",
    historical_source: "https://github.com/stone-zeng/china-infectious-diseases",
    count: records.length,
    records,
  });
}
