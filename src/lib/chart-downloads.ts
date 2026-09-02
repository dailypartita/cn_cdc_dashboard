import { CDC_NAV } from "@/lib/links";

export type ChartDownload = {
  id: "notifiable-cases" | "notifiable-deaths" | "sentinel-ili" | "sentinel-sari" | "covid-positivity";
  section: string;
  label: string;
  filename: string;
};

export const CHART_DOWNLOADS: ChartDownload[] = [
  {
    id: "notifiable-cases",
    section: CDC_NAV[0].name,
    label: "法定传染病分病原月报告发病数",
    filename: "法定传染病_分病原发病数.csv",
  },
  {
    id: "notifiable-deaths",
    section: CDC_NAV[0].name,
    label: "法定传染病分病原月报告死亡数",
    filename: "法定传染病_分病原死亡数.csv",
  },
  {
    id: "sentinel-ili",
    section: CDC_NAV[1].name,
    label: "门急诊流感样病例（ILI）病原体核酸检测阳性率",
    filename: "哨点_门急诊ILI阳性率.csv",
  },
  {
    id: "sentinel-sari",
    section: CDC_NAV[1].name,
    label: "住院严重急性呼吸道感染（SARI）病原体核酸检测阳性率",
    filename: "哨点_住院SARI阳性率.csv",
  },
  {
    id: "covid-positivity",
    section: CDC_NAV[2].name,
    label: "哨点医院新冠病毒核酸检测阳性率",
    filename: "新冠_哨点阳性率.csv",
  },
];

export const CHART_DOWNLOAD_GROUPS = CDC_NAV.map((nav) => ({
  section: nav.name,
  items: CHART_DOWNLOADS.filter((item) => item.section === nav.name),
}));

export function chartDownloadPath(id: ChartDownload["id"]) {
  return `/download/charts/${id}.csv`;
}

export function isChartDownloadId(id: string): id is ChartDownload["id"] {
  return CHART_DOWNLOADS.some((item) => item.id === id);
}
