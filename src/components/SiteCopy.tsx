import type { ReactNode } from "react";
import {
  CDC_HEALTH_DATA,
  FORECAST_HUB,
  FORECAST_HUB_GITHUB,
  HUBVERSE,
  SITE_TAGLINE,
} from "@/lib/links";

export function UnofficialBadge({ variant = "page" }: { variant?: "page" | "nav" }) {
  if (variant === "nav") {
    return (
      <span className="hidden shrink-0 border border-line bg-muted px-1.5 py-px font-mono text-[0.6875rem] font-medium text-warning sm:inline">
        非官方
      </span>
    );
  }

  return (
    <p className="inline-flex items-center border border-line bg-muted px-2 py-0.5 font-mono text-xs font-medium text-warning">
      {SITE_TAGLINE}
    </p>
  );
}

export function DisclaimerNotice({ children }: { children?: ReactNode }) {
  return (
    <aside className="mt-5 max-w-3xl border-l-[0.25rem] border-warning bg-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
      {children ?? (
        <>
          本站由社区从公开网页抽取并维护，<strong>不是中国 CDC 官方网站</strong>
          ，也不代表中国疾病预防控制中心的立场。引用与决策请以{" "}
          <a
            className="text-primary hover:underline"
            href={CDC_HEALTH_DATA}
            target="_blank"
            rel="noopener noreferrer"
          >
            中国 CDC 健康数据
          </a>{" "}
          原文为准。原始数据知识产权属于中国疾病预防控制中心，仅供非商业研究使用。
        </>
      )}
    </aside>
  );
}

export function ForecastHubIntro() {
  return (
    <section className="mt-8 w-full border border-line bg-surface px-5 py-5">
      <h2 className="text-base font-semibold text-ink">预测竞技场</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-ink">
        基于{" "}
        <a
          className="text-primary hover:underline"
          href={HUBVERSE}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hubverse
        </a>{" "}
        框架的交互式预测与评估平台，展示并比较多家模型对中国门急诊流感样病例（ILI）中
        SARS-CoV-2 阳性率的概率预测。欢迎按周提交预测，并在站点上查看各模型与评估排名。
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
        <a
          className="text-primary hover:underline"
          href={FORECAST_HUB}
          target="_blank"
          rel="noopener noreferrer"
        >
          打开预测竞技场
        </a>
        <a
          className="text-primary hover:underline"
          href={FORECAST_HUB_GITHUB}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub 说明
        </a>
      </p>
    </section>
  );
}
