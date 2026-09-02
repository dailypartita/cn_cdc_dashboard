export const SITE_NAME = "中国疾控结构化数据库（非官方开源项目）";
export const CDC_HEALTH_DATA = "https://www.chinacdc.cn/jksj/";
export const CDC_NOTIFIABLE = "https://www.chinacdc.cn/jksj/jksj01/";
export const CDC_COVID = "https://www.chinacdc.cn/jksj/xgbdyq/";
export const CDC_BULLETINS = "https://www.chinacdc.cn/jksj/jksj04_14275/";
export const FORECAST_HUB = "https://dailypartita.github.io/China-COVID-19-Forecast-Dashboard/";
export const SITE_GITHUB =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/dailypartita/cn_cdc_dashboard";
export const SITE_ISSUES = `${SITE_GITHUB.replace(/\/$/, "")}/issues/new`;

export type CdcNavItem = {
  id: "notifiable" | "sentinel" | "covid";
  name: string;
  href: string;
  source: string;
};

/** Home sections, CDC 健康数据 order requested for this site. */
export const CDC_NAV: CdcNavItem[] = [
  {
    id: "notifiable",
    name: "全国法定传染病疫情情况",
    href: "/#notifiable",
    source: CDC_NOTIFIABLE,
  },
  {
    id: "sentinel",
    name: "全国急性呼吸道传染病哨点监测情况",
    href: "/#sentinel",
    source: CDC_BULLETINS,
  },
  {
    id: "covid",
    name: "全国新型冠状病毒感染疫情情况",
    href: "/#covid",
    source: CDC_COVID,
  },
];
