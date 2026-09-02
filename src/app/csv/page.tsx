import { CDC_BULLETINS, CDC_NOTIFIABLE, SITE_PAGES, withBase } from "@/lib/links";
import { loadAll, loadNotifiable } from "@/lib/data/load";
import { DATA_FILES, NOTIFIABLE_FILE, VARIANT_FILE } from "@/lib/data/files";
import { CHART_DOWNLOADS, chartDownloadPath } from "@/lib/chart-downloads";
import { uniqueWeeks } from "@/lib/data/parse";
import { uniqueMonths } from "@/lib/data/notifiable";
import { buildTable1 } from "@/lib/data/table1";

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
  ["source_url", "原文链接"],
];

export default function CsvPage() {
  const records = loadAll();
  const notifiable = loadNotifiable();
  const table = buildTable1(records);
  const weeks = uniqueWeeks(records);
  const latest = weeks[weeks.length - 1];
  const nidMonths = uniqueMonths(notifiable);
  const latestNid = nidMonths[nidMonths.length - 1];

  return (
    <main className="px-6 py-8 lg:px-10">
      <h1 className="text-[28px] font-bold">CSV</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-neutral-600">
        哨点周报由本站从{" "}
        <a className="underline decoration-neutral-300 underline-offset-2" href={CDC_BULLETINS}>
          中国 CDC 健康数据
        </a>{" "}
        整理。法定传染病月报从{" "}
        <a className="underline decoration-neutral-300 underline-offset-2" href={CDC_NOTIFIABLE}>
          疫情概况统计表
        </a>{" "}
        抽表。非商业研究使用。同一份表也提供 <span className="font-mono">Parquet</span>
        （把下载链接的 <span className="font-mono">.csv</span> 换成 <span className="font-mono">.parquet</span>）。
      </p>

      <h2 className="mt-8 text-[18px] font-bold">交互图</h2>
      <p className="mt-2 text-[15px] text-neutral-500">与首页各图对应的完整序列，未做时间窗或病原筛选。</p>
      <ul className="mt-3 space-y-2 text-[16px]">
        {CHART_DOWNLOADS.map((item) => (
          <li key={item.id}>
            <a
              className="text-neutral-800 underline decoration-neutral-300 underline-offset-2"
              href={chartDownloadPath(item.id)}
              download={item.filename}
            >
              {item.filename}
            </a>
            <span className="ml-2 text-[15px] text-neutral-400">{item.label}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[18px] font-bold">哨点监测</h2>
      {latest ? (
        <p className="mt-2 text-[15px] text-neutral-500">
          {weeks[0]?.label} – {latest.label}，{weeks.length} 周，{records.length} 条
          {table ? `，最新 ${table.weekLabel}` : ""}。
        </p>
      ) : null}
      <ul className="mt-3 space-y-2 text-[16px]">
        {DATA_FILES.map((file) => (
          <li key={file}>
            <a className="text-neutral-800 underline decoration-neutral-300 underline-offset-2" href={withBase(`/download/${file}`)}>
              {file}
            </a>
            <span className="ml-2 text-[15px] text-neutral-400">
              {file === "cncdc_surveillance_all.csv"
                ? "11 病原体主表"
                : file === "cncdc_surveillance_covid19.csv"
                  ? "新冠 ILI 阳性率（2022 年 12 月起；SARI 自 2024 年 11 月）"
                  : "2025 年第 14–22 周新冠月报回溯（主表已含同期 11 病原体）"}
            </span>
          </li>
        ))}
        {latest ? (
          <li>
            <a
              className="text-neutral-800 underline decoration-neutral-300 underline-offset-2"
              href={withBase(`/download/snapshots/${latest.key}.csv`)}
            >
              {latest.key}.csv
            </a>
            <span className="ml-2 text-[15px] text-neutral-400">最新单周快照</span>
          </li>
        ) : null}
      </ul>

      <h2 className="mt-10 text-[18px] font-bold">法定传染病</h2>
      {latestNid ? (
        <p className="mt-2 text-[15px] text-neutral-500">
          {nidMonths[0]?.label} – {latestNid.label}，{nidMonths.length} 个月，{notifiable.length} 条。
        </p>
      ) : null}
      <ul className="mt-3 space-y-2 text-[16px]">
        <li>
          <a
            className="text-neutral-800 underline decoration-neutral-300 underline-offset-2"
            href={withBase(`/download/${NOTIFIABLE_FILE}`)}
          >
            {NOTIFIABLE_FILE}
          </a>
          <span className="ml-2 text-[15px] text-neutral-400">分病原月报主表</span>
        </li>
        {latestNid ? (
          <li>
            <a
              className="text-neutral-800 underline decoration-neutral-300 underline-offset-2"
              href={withBase(`/download/notifiable/${latestNid.month}.csv`)}
            >
              {latestNid.month}.csv
            </a>
            <span className="ml-2 text-[15px] text-neutral-400">最新单月快照</span>
          </li>
        ) : null}
      </ul>

      <h2 className="mt-10 text-[18px] font-bold">新冠流行株</h2>
      <p className="mt-2 text-[15px] text-neutral-500">
        从中国 CDC 每月新冠疫情通报「病毒变异监测」正文抽取的周占比。
      </p>
      <ul className="mt-3 space-y-2 text-[16px]">
        <li>
          <a
            className="text-neutral-800 underline decoration-neutral-300 underline-offset-2"
            href={withBase(`/download/${VARIANT_FILE}`)}
          >
            {VARIANT_FILE}
          </a>
          <span className="ml-2 text-[15px] text-neutral-400">主要流行株周构成比</span>
        </li>
      </ul>

      <pre className="mt-6 overflow-x-auto border border-neutral-200 bg-neutral-50 p-4 text-[14px] leading-relaxed text-neutral-700">
{`import pandas as pd
df = pd.read_csv("${SITE_PAGES}/download/notifiable_all.csv")
df = pd.read_parquet("${SITE_PAGES}/download/notifiable_all.parquet")`}
      </pre>

      <h2 className="mt-10 text-[18px] font-bold">哨点字段</h2>
      <FieldTable rows={COLUMNS} />
      <h2 className="mt-8 text-[18px] font-bold">法定传染病字段</h2>
      <FieldTable rows={NID_COLUMNS} />
      <h2 className="mt-8 text-[18px] font-bold">新冠流行株字段</h2>
      <FieldTable rows={VARIANT_COLUMNS} />
    </main>
  );
}

function FieldTable({ rows }: { rows: string[][] }) {
  return (
    <table className="mt-3 w-full border-collapse text-[15px]">
      <tbody>
        {rows.map(([name, desc]) => (
          <tr key={name}>
            <td className="border border-neutral-200 px-3 py-1.5 font-mono text-[14px]">{name}</td>
            <td className="border border-neutral-200 px-3 py-1.5 text-neutral-600">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
