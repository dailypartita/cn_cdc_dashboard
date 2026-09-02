import { loadCovidVariants } from "@/lib/data/load";

export const dynamic = "force-static";

export function GET() {
  const records = loadCovidVariants();
  return Response.json({
    source: "china_cdc_xgbdyq",
    count: records.length,
    records,
  });
}
