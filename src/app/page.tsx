import type { ReactNode } from "react";
import Link from "next/link";
import { CDC_NAV, CNIC_ZENODO, SITE_ISSUES, SITE_NAME, withBase } from "@/lib/links";
import { loadAll, loadCnic, loadCovid, loadNotifiable } from "@/lib/data/load";
import { cnicSpan, hasIli, hasPositivity } from "@/lib/data/cnic";
import { dataStatus } from "@/lib/data/status";
import { BulletinCharts } from "@/components/BulletinCharts";
import { CnicFluCharts } from "@/components/CnicFluCharts";
import { CovidCharts } from "@/components/CovidCharts";
import { NotifiableCharts } from "@/components/NotifiableCharts";
import { DisclaimerNotice, ForecastHubIntro } from "@/components/SiteCopy";

export default function HomePage() {
  const records = loadAll();
  const covid = loadCovid();
  const notifiable = loadNotifiable();
  const cnic = loadCnic();
  const status = dataStatus();
  const latestWeek = status.sentinel;
  const latestMonth = status.notifiable;
  const latestCovid = status.covid;
  const iliSpan = cnicSpan(cnic, hasIli);
  const positivitySpan = cnicSpan(cnic, hasPositivity);

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
    {
      ...CDC_NAV[3],
      index: "4",
      meta: iliSpan ? `ILI% ${iliSpan.first.label} – ${iliSpan.last.label}` : undefined,
    },
  ];

  return (
    <main className="px-6 py-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-3xl text-left">
        <header>
          <h1 className="text-[1.75rem] font-semibold leading-snug text-ink">{SITE_NAME}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-ink">
            把中国 CDC 公开发布的传染病月报、急性呼吸道哨点周报与新冠疫情通报，整理成可交互图表，并提供 CSV。
          </p>
          <DisclaimerNotice />
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/csv"
              className="inline-flex cursor-pointer border border-primary bg-primary px-3.5 py-2 text-[0.9375rem] text-primary-fg hover:border-primary hover:bg-primary"
            >
              下载 CSV
            </Link>
            <a
              href={SITE_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer border border-primary bg-surface px-3.5 py-2 text-[0.9375rem] text-primary hover:border-primary hover:bg-hover-wash"
            >
              反馈问题
            </a>
          </div>
        </header>

        <ForecastHubIntro />

        <nav aria-label="本页目录" className="mt-8">
          <p className="text-[0.8125rem] font-medium text-muted-ink">本页图表</p>
          <ol className="mt-2 space-y-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={withBase(item.href)} className="group flex items-baseline gap-3 text-base hover:text-primary hover:underline">
                  <span className="w-6 shrink-0 font-mono tabular-nums text-muted-ink">{item.index}.</span>
                  <span className="font-medium text-ink group-hover:text-primary">{item.name}</span>
                  {item.meta ? (
                    <span className="font-mono text-[0.9375rem] font-medium text-primary">{item.meta}</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <Chapter id="notifiable" title={`1. ${CDC_NAV[0].name}`} meta={toc[0].meta} sourceHref={CDC_NAV[0].source}>
        <NotifiableCharts records={notifiable} />
        <Note>
          分病原发病数、死亡数由本站从中国 CDC 每月《全国传染病疫情概况》统计表抽取，口径与原文一致（病毒性肝炎为分型合计）。甲类病例很少，默认展示主要乙类/丙类病原。
        </Note>
        <Note>
          登革热自 2004 年 1 月、流行性感冒自 2009 年 3 月的更早月份，补自{" "}
          <a
            className="text-primary hover:underline"
            href="https://github.com/stone-zeng/china-infectious-diseases"
            target="_blank"
            rel="noopener noreferrer"
          >
            stone-zeng/china-infectious-diseases
          </a>{" "}
          整理的官方月报，不改 2024 年起的中国 CDC 行。来源把 2010 年 11 月标成了第二个 2010 年 10 月，已按该月公报总计改回。2013 年 11
          月起甲型 H1N1 并入流行性感冒，此前没有加进这条线。其余病原仍从 2024 年 1
          月起。哨点「流感病毒」阳性率是另一套周数据。
        </Note>
      </Chapter>

      <Chapter id="sentinel" title={`2. ${CDC_NAV[1].name}`} meta={toc[1].meta} sourceHref={CDC_NAV[1].source}>
        <BulletinCharts records={records} />
        <Note>
          阳性率是哨点医院采样检测结果，不是人群发病率；各病原体独立检测，不可加总为 100%。数据由本站从中国 CDC 哨点周报抽取；已按官方表1校正已知的小数点/列错位。这里的「流感病毒」从 2024 年第 46 周起，不是第 4 节国家流感中心的 ILI% 或检测阳性率。默认近 52 周。
        </Note>
      </Chapter>

      <Chapter id="covid" title={`3. ${CDC_NAV[2].name}`} meta={toc[2].meta} sourceHref={CDC_NAV[2].source}>
        <CovidCharts records={covid} />
        <Note>
          门急诊 ILI 阳性率自 2022 年第 49 周（2022-12-05）起，住院 SARI 自 2024 年 11 月多病原周报起。没有找到更早的同一口径周阳性率，2020–2022
          年的每日确诊数没有并进这张图。
        </Note>
      </Chapter>

      <Chapter id="cnic" title={`4. ${CDC_NAV[3].name}`} meta={toc[3].meta} sourceHref={CDC_NAV[3].source}>
        <CnicFluCharts records={cnic} />
        <Note>
          {iliSpan
            ? `ILI% ${iliSpan.first.label} – ${iliSpan.last.label}，${iliSpan.count} 周。`
            : "ILI% 序列尚未入库。"}
          {positivitySpan
            ? `检测阳性率 ${positivitySpan.first.label} – ${positivitySpan.last.label}，${positivitySpan.count} 周。`
            : ""}
          {iliSpan?.gaps.length ? ` ILI% 缺 ${iliSpan.gaps.join("、")}。` : " ILI% 在已收录区间内没有缺周。"}
          默认仍是近 52 周；选「全部」查看上述整段。
        </Note>
        <Note>
          这是国家流感中心《流感监测周报》的南方、北方哨点医院 ILI%（流感样病例占门急诊就诊总数的百分比），以及这些 ILI
          标本的流感病毒检测阳性率。与第 2 节 11 病原体哨点「流感病毒」核酸阳性率不是同一网络、同一指标，没有并进那两条线，也不是第 1
          节的月报发病数。周报仍把内科、儿内科 ILI% 分开写的早期周次没有合并进来。原文页面或 PDF
          与{" "}
          <a className="text-primary hover:underline" href={CNIC_ZENODO} target="_blank" rel="noopener noreferrer">
            Zenodo 10.5281/zenodo.22784835
          </a>{" "}
          （Zhao, Quanjingbo，CC BY 4.0）重叠时，以中国流感中心原文为准。
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
    <section id={id} className="mt-12 scroll-mt-20 border-t border-line pt-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {meta ? (
        <p className="mt-2 font-mono text-[0.8125rem] text-muted-ink">
          {meta}
          <span className="mx-2 text-line">|</span>
          <a className="font-sans text-primary hover:underline" href={sourceHref} target="_blank" rel="noopener noreferrer">
            中国 CDC 原文
          </a>
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-3xl text-[0.8125rem] leading-relaxed text-muted-ink">{children}</p>;
}
