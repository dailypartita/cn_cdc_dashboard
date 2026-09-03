import type { ReactNode } from "react";
import Link from "next/link";
import { CDC_NAV, SITE_ISSUES, SITE_NAME, withBase } from "@/lib/links";
import { loadAll, loadCovid, loadNotifiable } from "@/lib/data/load";
import { dataStatus } from "@/lib/data/status";
import { BulletinCharts } from "@/components/BulletinCharts";
import { CovidCharts } from "@/components/CovidCharts";
import { NotifiableCharts } from "@/components/NotifiableCharts";
import { DisclaimerNotice, ForecastHubIntro, UnofficialBadge } from "@/components/SiteCopy";

export default function HomePage() {
  const records = loadAll();
  const covid = loadCovid();
  const notifiable = loadNotifiable();
  const status = dataStatus();
  const latestWeek = status.sentinel;
  const latestMonth = status.notifiable;
  const latestCovid = status.covid;

  const toc = [
    {
      ...CDC_NAV[0],
      index: "1",
      meta: latestMonth ? `月报 ${latestMonth.label}` : undefined,
    },
    {
      ...CDC_NAV[1],
      index: "2",
      meta: latestWeek
        ? `监测周 ${latestWeek.reference_date} 至 ${latestWeek.target_end_date}（${latestWeek.label}）`
        : undefined,
    },
    {
      ...CDC_NAV[2],
      index: "3",
      meta: latestCovid
        ? `监测周 ${latestCovid.reference_date} 至 ${latestCovid.target_end_date}（${latestCovid.label}）`
        : undefined,
    },
  ];

  return (
    <main className="px-6 py-6 lg:px-10 lg:py-8">
      <header className="max-w-3xl">
        <UnofficialBadge />
        <h1 className="mt-3 text-[28px] font-bold leading-snug text-neutral-900">{SITE_NAME}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-neutral-600">
          把中国 CDC 公开发布的传染病月报、急性呼吸道哨点周报与新冠疫情通报，整理成可交互图表，并提供 CSV /
          Parquet 与只读 API。
        </p>
        <DisclaimerNotice />
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/csv"
            className="inline-flex cursor-pointer border border-[#1b6bb8] bg-[#1b6bb8] px-3.5 py-2 text-[15px] text-white hover:bg-[#155a9c]"
          >
            下载 CSV / Parquet
          </Link>
          <a
            href={SITE_ISSUES}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer border border-[#1b6bb8] px-3.5 py-2 text-[15px] text-[#1b6bb8] hover:bg-[#1b6bb8]/5"
          >
            反馈问题
          </a>
        </div>
      </header>

      <ForecastHubIntro />

      <nav aria-label="本页目录" className="mt-8 max-w-3xl">
        <p className="text-[13px] font-medium tracking-wide text-neutral-400">本页图表</p>
        <ol className="mt-2 space-y-2">
          {toc.map((item) => (
            <li key={item.id}>
              <a href={withBase(item.href)} className="group flex items-baseline gap-3 text-[16px] hover:text-[#1b6bb8]">
                <span className="w-6 shrink-0 tabular-nums text-neutral-400">{item.index}.</span>
                <span className="font-medium text-neutral-800 group-hover:text-[#1b6bb8]">{item.name}</span>
                {item.meta ? (
                  <span className="text-[15px] font-medium text-[#1b6bb8]">{item.meta}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Chapter id="notifiable" title={`1. ${CDC_NAV[0].name}`} meta={toc[0].meta} sourceHref={CDC_NAV[0].source}>
        <NotifiableCharts records={notifiable} />
        <Note>
          分病原发病数、死亡数由本站从中国 CDC 每月《全国传染病疫情概况》统计表抽取，口径与原文一致（病毒性肝炎为分型合计）。甲类病例很少，默认展示主要乙类/丙类病原。
        </Note>
      </Chapter>

      <Chapter id="sentinel" title={`2. ${CDC_NAV[1].name}`} meta={toc[1].meta} sourceHref={CDC_NAV[1].source}>
        <BulletinCharts records={records} />
        <Note>
          阳性率是哨点医院采样检测结果，不是人群发病率；各病原体独立检测，不可加总为 100%。数据由本站从中国 CDC 哨点周报抽取；已按官方表1校正已知的小数点/列错位。
        </Note>
      </Chapter>

      <Chapter id="covid" title={`3. ${CDC_NAV[2].name}`} meta={toc[2].meta} sourceHref={CDC_NAV[2].source}>
        <CovidCharts records={covid} />
        <Note>
          门急诊 ILI 阳性率自 2022 年 12 月起；住院 SARI 自 2024 年 11 月多病原周报起。阳性率为哨点医院核酸检测结果。
        </Note>
      </Chapter>
    </main>
  );
}

function Chapter({
  id,
  title,
  meta,
  sourceHref,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  sourceHref: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 border-t border-neutral-200 pt-8">
      <h2 className="text-[18px] font-bold text-neutral-900">{title}</h2>
      {meta ? (
        <p className="mt-2 text-[13px] text-neutral-500">
          {meta}
          <span className="mx-2 text-neutral-300">|</span>
          <a className="text-[#1b6bb8] hover:underline" href={sourceHref} target="_blank" rel="noopener noreferrer">
            中国 CDC 原文
          </a>
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-neutral-500">{children}</p>;
}
