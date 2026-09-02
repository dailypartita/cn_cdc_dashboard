import { dataStatus } from "@/lib/data/status";
import { DATA_REVALIDATE } from "@/lib/data/cache";
import { jsonResponse, optionsResponse } from "@/lib/api/http";

export const revalidate = DATA_REVALIDATE;

export function OPTIONS() {
  return optionsResponse();
}

export function GET() {
  const status = dataStatus();
  return jsonResponse({
    synced_at: status.synced_at,
    sentinel: status.sentinel
      ? {
          key: status.sentinel.key,
          label: status.sentinel.label,
          reference_date: status.sentinel.reference_date,
          target_end_date: status.sentinel.target_end_date,
          weeks: status.weekCount,
        }
      : null,
    notifiable: status.notifiable
      ? {
          month: status.notifiable.month,
          label: status.notifiable.label,
          months: status.monthCount,
        }
      : null,
    covid_positivity: status.covid
      ? {
          key: status.covid.key,
          label: status.covid.label,
          reference_date: status.covid.reference_date,
          target_end_date: status.covid.target_end_date,
          weeks: status.covidWeekCount,
        }
      : null,
    covid_variants: status.covidVariants
      ? {
          week_start: status.covidVariants.week_start,
          label: status.covidVariants.label,
          weeks: status.variantWeekCount,
        }
      : null,
  });
}
