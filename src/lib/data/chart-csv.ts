import { CHART_DOWNLOADS, isChartDownloadId, type ChartDownload } from "@/lib/chart-downloads";
import { loadAll, loadCovid, loadNotifiable } from "@/lib/data/load";

export function buildChartCsv(id: ChartDownload["id"]): string {
  switch (id) {
    case "notifiable-cases":
      return notifiableMetricCsv("cases");
    case "notifiable-deaths":
      return notifiableMetricCsv("deaths");
    case "sentinel-ili":
      return sentinelMetricCsv("ili_percent");
    case "sentinel-sari":
      return sentinelMetricCsv("sari_percent");
    case "covid-positivity":
      return covidPositivityCsv();
  }
}

export function chartDownloadByFileParam(raw: string): ChartDownload | undefined {
  const id = raw.replace(/\.(csv|parquet)$/i, "");
  if (!isChartDownloadId(id)) return undefined;
  return CHART_DOWNLOADS.find((item) => item.id === id);
}

function notifiableMetricCsv(metric: "cases" | "deaths"): string {
  const header = `reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,${metric}`;
  const body = loadNotifiable()
    .filter((row) => row.row_kind !== "summary")
    .map((row) =>
      [
        row.reference_date,
        row.target_end_date,
        row.month,
        row.report_date,
        csvCell(row.disease),
        row.disease_class,
        row.row_kind,
        row[metric],
      ].join(","),
    );
  return [header, ...body].join("\n") + "\n";
}

function sentinelMetricCsv(metric: "ili_percent" | "sari_percent"): string {
  const header = `reference_date,target_end_date,report_week,pathogen,${metric}`;
  const body = loadAll().map((row) =>
    [row.reference_date, row.target_end_date, row.report_week, csvCell(row.pathogen), row[metric] ?? ""].join(","),
  );
  return [header, ...body].join("\n") + "\n";
}

function covidPositivityCsv(): string {
  const header = "reference_date,target_end_date,report_week,ili_percent,sari_percent";
  const body = loadCovid()
    .filter((row) => row.pathogen === "新型冠状病毒")
    .map((row) =>
      [row.reference_date, row.target_end_date, row.report_week, row.ili_percent ?? "", row.sari_percent ?? ""].join(
        ",",
      ),
    );
  return [header, ...body].join("\n") + "\n";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
