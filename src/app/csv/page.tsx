import type { Metadata } from "next";
import { CDC_BULLETINS, CDC_NOTIFIABLE, CNIC_WEEKLY, CNIC_ZENODO, FORECAST_HUB, SITE_PAGES, withBase } from "@/lib/links";
import { loadAll, loadCnic, loadNotifiable } from "@/lib/data/load";
import { cnicSpan, hasIli, hasPositivity } from "@/lib/data/cnic";
import { CNIC_FILE, DATA_FILES, NOTIFIABLE_FILE, VARIANT_FILE } from "@/lib/data/files";
import { CHART_DOWNLOAD_GROUPS, chartDownloadPath } from "@/lib/chart-downloads";
import { uniqueWeeks } from "@/lib/data/parse";
import { diseaseCoverage, uniqueMonths } from "@/lib/data/notifiable";
import { buildTable1 } from "@/lib/data/table1";
import { DisclaimerNotice, UnofficialBadge } from "@/components/SiteCopy";

const SENTINEL_FILE_DESC: Record<string, string> = {
  "cncdc_surveillance_all.csv": "11 病原体主表",
  "cncdc_surveillance_covid19.csv": "新冠 ILI 阳性率（2022 年 12 月起；SARI 自 2024 年 11 月）",
  "cncdc_suverillance_2025_14_22.csv": "2025 年第 14–22 周新冠月报回溯（主表已含同期 11 病原体）",
};

const COLUMNS = [
  ["reference_date", "监测周起始日（周一）"],
  ["target_end_date", "监测周结束日（周日）"],
  ["report_week", "ISO 周序号"],
  ["pathogen", "病原体中文名"],
  ["ili_percent", "门急诊 ILI 阳性率（%）"],
  ["sari_percent", "住院 SARI 阳性率（%）"],
];

const VARIANT_COLUMNS = [
  ["reference_date", "监测周起始日（周一）"],
  ["target_end_date", "监测周结束日（周日）"],
  ["year", "ISO 周年"],
  ["week", "ISO 周序号"],
  ["week_start", "该周周一（同 reference_date）"],
  ["lineage", "流行株（月报口径）"],
  ["share", "占有效基因组序列的构成比（%）"],
  ["sequences", "该月报送有效序列数"],
  ["month", "来源月报（YYYY-MM）"],
  ["source_url", "原文链接"],
];

const CNIC_COLUMNS = [
  ["reference_date", "监测周起始日（周一）"],
  ["target_end_date", "监测周结束日（周日）"],
  ["year", "ISO 周年"],
  ["week", "ISO 周序号"],
  ["ili_south", "南方哨点医院 ILI%（占门急诊）"],
  ["ili_north", "北方哨点医院 ILI%（占门急诊）"],
  ["positivity_south", "南方 ILI 标本流感检测阳性率（%）"],
  ["positivity_north", "北方 ILI 标本流感检测阳性率（%）"],
  ["positivity_national", "全国 ILI 标本流感检测阳性率（%）"],
  ["tests_national", "全国检测标本数"],
  ["positives_national", "全国流感阳性标本数"],
  ["h1_national", "全国 A(H1N1)pdm09 阳性数"],
  ["h3_national", "全国 A(H3N2) 阳性数"],
  ["bvic_national", "全国 B/Victoria 阳性数"],
  ["byam_national", "全国 B/Yamagata 阳性数"],
  ["source_url", "该周国家流感中心周报"],
  ["ili_extract", "ILI% 来源：cnic-html、cnic-pdf 或 zenodo-22784835"],
  ["lab_extract", "实验室指标来源，口径同上"],
];

const NID_COLUMNS = [
  ["reference_date", "监测期起始日（该月 1 日）"],
  ["target_end_date", "监测期结束日（该月最后一天）"],
  ["month", "报告月（YYYY-MM）"],
  ["report_date", "CDC 网页发布日期"],
  ["disease", "病原"],
  ["disease_class", "甲类 / 乙类 / 丙类 / 重点监测"],
  ["row_kind", "disease 病原；group 肝炎合计；summary 总计行"],
  ["cases", "发病数"],
  ["deaths", "死亡数"],
  ["source_url", "月报原文。2024 年前的登革热、流感为 stone-zeng 所引公报"],
];

export const metadata: Metadata = {
  title: "CSV",
  description:
    "非官方开源项目提供的哨点监测、法定传染病与新冠流行株结构化表，可下载 CSV。非正式中国 CDC 数据发布。",
};

export default function CsvPage() {
  const records = loadAll();
  const notifiable = loadNotifiable();
  const cnic = loadCnic();
  const iliSpan = cnicSpan(cnic, hasIli);
  const positivitySpan = cnicSpan(cnic, hasPositivity);
  const table = buildTable1(records);
  const weeks = uniqueWeeks(records);
  const latest = weeks[weeks.length - 1];
  const nidMonths = uniqueMonths(notifiable);
  const latestNid = nidMonths[nidMonths.length - 1];
  const dengue = diseaseCoverage(notifiable, "登革热");
  const flu = diseaseCoverage(notifiable, "流行性感冒");
  const otherMonths = [
    ...new Set(
      notifiable
        .filter((row) => row.row_kind === "disease" && row.disease !== "登革热" && row.disease !== "流行性感冒")
        .map((row) => row.month),
    ),
  ].sort();

  const sentinelFiles = [
    ...DATA_FILES.map((file) => ({
      href: withBase(`/download/${file}`),
      name: file,
      desc: SENTINEL_FILE_DESC[file] ?? file,
    })),
    ...(latest
      ? [
          {
            href: withBase(`/download/snapshots/${latest.key}.csv`),
            name: `${latest.key}.csv`,
            desc: "最新单周快照",
          },
        ]
      : []),
  ];

  const notifiableFiles = [
    {
      href: withBase(`/download/${NOTIFIABLE_FILE}`),
      name: NOTIFIABLE_FILE,
      desc: "分病原月报主表",
    },
    ...(latestNid
      ? [
          {
            href: withBase(`/download/notifiable/${latestNid.month}.csv`),
            name: `${latestNid.month}.csv`,
            desc: "最新单月快照",
          },
        ]
      : []),
  ];

  return (
    <main className="px-6 py-6 lg:px-10 lg:py-8">
      <header className="max-w-3xl">
        <UnofficialBadge />
        <h1 className="mt-3 text-[1.75rem] font-semibold leading-snug text-ink">CSV</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-ink">
          本站从公开网页整理的结构化表，供非商业研究下载。哨点周报来自{" "}
          <a
            className="text-primary hover:underline"
            href={CDC_BULLETINS}
            target="_blank"
            rel="noopener noreferrer"
          >
            中国 CDC 健康数据
          </a>
          ，法定传染病月报来自{" "}
          <a
            className="text-primary hover:underline"
            href={CDC_NOTIFIABLE}
            target="_blank"
            rel="noopener noreferrer"
          >
            疫情概况统计表
          </a>
          。同源哨点序列也用于{" "}
          <a
            className="text-primary hover:underline"
            href={FORECAST_HUB}
            target="_blank"
            rel="noopener noreferrer"
          >
            预测竞技场
          </a>{" "}
          的门急诊 ILI 新冠阳性率多模型预测。
        </p>
        <DisclaimerNotice />
      </header>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">读取示例</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-ink">
          pandas 可直接读远程文件。站点为静态托管，不设自定义 CORS 头。
        </p>
        <pre className="mt-4 overflow-x-auto border border-line bg-muted p-4 font-mono text-sm leading-relaxed text-ink">
{`import pandas as pd
df = pd.read_csv("${SITE_PAGES}/download/notifiable_all.csv")`}
        </pre>
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">与首页图表对应</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-ink">
          完整序列，未做时间窗或病原筛选。文件名按图意命名，便于直接对照首页各图。
        </p>
        {CHART_DOWNLOAD_GROUPS.map((group) => (
          <div key={group.section} className="mt-5">
            <h3 className="text-sm font-medium text-muted-ink">{group.section}</h3>
            <FileList
              items={group.items.map((item) => ({
                href: chartDownloadPath(item.id),
                name: item.filename,
                desc: item.label,
                download: item.filename,
              }))}
            />
          </div>
        ))}
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">哨点监测</h2>
        {latest ? (
          <p className="mt-2 font-mono text-[0.9375rem] leading-relaxed text-muted-ink">
            {weeks[0]?.label} – {latest.label}，{weeks.length} 周，{records.length} 条
            {table ? `，最新 ${table.weekLabel}` : ""}。
          </p>
        ) : (
          <p className="mt-2 text-[0.9375rem] text-muted-ink">11 病原体周序列主表与单周快照。</p>
        )}
        <FileList items={sentinelFiles} />
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">法定传染病</h2>
        {latestNid ? (
          <div className="mt-2 space-y-2 font-mono text-[0.9375rem] leading-relaxed text-muted-ink">
            <p>
              有数据的月份 {nidMonths[0]?.label} – {latestNid.label}，{nidMonths.length} 个月，{notifiable.length} 条。
            </p>
            <p>
              登革热 {dengue.first} – {dengue.last}，{dengue.count} 个月
              {dengue.gaps.length ? `，缺 ${dengue.gaps.join("、")}` : ""}。流行性感冒 {flu.first} – {flu.last}，
              {flu.count} 个月
              {flu.gaps.length ? `，缺 ${flu.gaps.join("、")}` : ""}。其余病原 {otherMonths[0]} – {otherMonths.at(-1)}。
            </p>
            <p className="font-sans text-[0.9375rem]">
              2024 年前只有登革热和流行性感冒，来自{" "}
              <a
                className="text-primary hover:underline"
                href="https://github.com/stone-zeng/china-infectious-diseases"
                target="_blank"
                rel="noopener noreferrer"
              >
                stone-zeng/china-infectious-diseases
              </a>
              。重叠月份保留中国 CDC 原文。来源把 2010-11 标成第二个 2010-10，已按公报总计改回，没有另造数字。
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[0.9375rem] text-muted-ink">分病原月报主表与单月快照。</p>
        )}
        <FileList items={notifiableFiles} />
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">国家流感中心周报</h2>
        {iliSpan && positivitySpan ? (
          <div className="mt-2 space-y-2 text-[0.9375rem] leading-relaxed text-muted-ink">
            <p className="font-mono">
              ILI% {iliSpan.first.label} – {iliSpan.last.label}，{iliSpan.count} 周
              {iliSpan.gaps.length ? `，缺 ${iliSpan.gaps.join("、")}` : ""}。检测阳性率 {positivitySpan.first.label} –{" "}
              {positivitySpan.last.label}，{positivitySpan.count} 周
              {positivitySpan.gaps.length ? `，缺 ${positivitySpan.gaps.join("、")}` : ""}。
            </p>
            <p>
              南方、北方哨点医院 ILI% 和 ILI 标本流感检测阳性率，来自{" "}
              <a className="text-primary hover:underline" href={CNIC_WEEKLY} target="_blank" rel="noopener noreferrer">
                国家流感中心周报
              </a>
              。不是上方 11 病原体哨点里的「流感病毒」核酸阳性率。HTML 或 PDF 没有写到的字段，用{" "}
              <a className="text-primary hover:underline" href={CNIC_ZENODO} target="_blank" rel="noopener noreferrer">
                Zenodo 10.5281/zenodo.22784835
              </a>{" "}
              （CC BY 4.0）填空；两边都有的数字以国家流感中心原文为准。表里还有南北方检测数和型别计数，空着表示原文没有这一格。
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[0.9375rem] text-muted-ink">国家流感中心 ILI% 与检测阳性率周序列。</p>
        )}
        <FileList
          items={[
            {
              href: withBase(`/download/${CNIC_FILE}`),
              name: CNIC_FILE,
              desc: "国家流感中心 ILI% 与检测阳性率",
            },
          ]}
        />
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">新冠流行株</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-ink">
          从中国 CDC 每月新冠疫情通报「病毒变异监测」正文抽取的周占比。
        </p>
        <FileList
          items={[
            {
              href: withBase(`/download/${VARIANT_FILE}`),
              name: VARIANT_FILE,
              desc: "主要流行株周构成比",
            },
          ]}
        />
      </section>

      <section className="mt-10 max-w-3xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">字段说明</h2>
        <h3 className="mt-6 text-[0.9375rem] font-medium text-muted-ink">哨点监测</h3>
        <FieldTable rows={COLUMNS} />
        <h3 className="mt-8 text-[0.9375rem] font-medium text-muted-ink">法定传染病</h3>
        <FieldTable rows={NID_COLUMNS} />
        <h3 className="mt-8 text-[0.9375rem] font-medium text-muted-ink">国家流感中心周报</h3>
        <FieldTable rows={CNIC_COLUMNS} />
        <h3 className="mt-8 text-[0.9375rem] font-medium text-muted-ink">新冠流行株</h3>
        <FieldTable rows={VARIANT_COLUMNS} />
      </section>
    </main>
  );
}

function FileList({
  items,
}: {
  items: { href: string; name: string; desc: string; download?: string }[];
}) {
  return (
    <ul className="mt-3 divide-y divide-line border border-line bg-surface">
      {items.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            download={item.download}
            className="flex flex-col gap-1 px-4 py-3 hover:bg-hover-wash sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <span className="font-mono text-sm text-primary">{item.name}</span>
            <span className="text-sm leading-snug text-muted-ink sm:text-right">{item.desc}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function FieldTable({ rows }: { rows: string[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.9375rem]">
        <thead>
          <tr className="bg-muted text-left text-[0.8125rem] text-muted-ink">
            <th className="border border-line px-3 py-1.5 font-medium">字段</th>
            <th className="border border-line px-3 py-1.5 font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, desc]) => (
            <tr key={name}>
              <td className="border border-line bg-surface px-3 py-1.5 font-mono text-sm">{name}</td>
              <td className="border border-line bg-surface px-3 py-1.5 text-muted-ink">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
