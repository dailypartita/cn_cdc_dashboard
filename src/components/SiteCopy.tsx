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
      <span className="hidden shrink-0 border border-white/80 bg-white/15 px-1.5 py-px text-[11px] font-medium tracking-wide text-white sm:inline">
        非官方
      </span>
    );
  }

  return (
    <p className="inline-flex items-center border border-amber-800/20 bg-amber-50 px-2 py-0.5 text-[12px] font-medium tracking-wide text-amber-950">
      {SITE_TAGLINE}
    </p>
  );
}

export function DisclaimerNotice({ children }: { children?: ReactNode }) {
  return (
    <aside className="mt-5 max-w-3xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-neutral-800">
      {children ?? (
        <>
          本站由社区从公开网页抽取并维护，<strong>不是中国 CDC 官方网站</strong>
          ，也不代表中国疾病预防控制中心的立场。引用与决策请以{" "}
          <a
            className="text-[#1b6bb8] hover:underline"
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
    <section className="mt-8 max-w-3xl border border-neutral-200 bg-neutral-50 px-5 py-5">
      <h2 className="text-[16px] font-bold text-neutral-900">预测竞技场</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
        基于{" "}
        <a
          className="text-[#1b6bb8] hover:underline"
          href={HUBVERSE}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hubverse
        </a>{" "}
        框架的交互式预测与评估平台，展示并比较多家模型对中国门急诊流感样病例（ILI）中
        SARS-CoV-2 阳性率的概率预测。欢迎按周提交 23 分位数预测，并在站点上查看各模型与评估排名。
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
        <a
          className="text-[#1b6bb8] hover:underline"
          href={FORECAST_HUB}
          target="_blank"
          rel="noopener noreferrer"
        >
          打开预测竞技场
        </a>
        <a
          className="text-[#1b6bb8] hover:underline"
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
