import type { Table1 } from "@/lib/data/table1";
import { formatDelta, formatRate } from "@/lib/data/table1";

function DeltaCell({ value }: { value: number | null }) {
  const text = formatDelta(value);
  const cls =
    value == null || value === 0
      ? "text-neutral-800"
      : value > 0
        ? "text-red-700"
        : "text-emerald-700";
  return <td className={`border border-neutral-300 px-2 py-1.5 text-center tabular-nums ${cls}`}>{text}</td>;
}

export function CdcTable1({ table }: { table: Table1 }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-center font-serif text-[17px] font-semibold text-neutral-900">
        表1 第{table.report_week}周呼吸道样本病原体核酸检测阳性率（%）
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px] text-neutral-800">
          <thead>
            <tr className="bg-neutral-50">
              <th rowSpan={2} className="border border-neutral-300 px-2 py-2 font-medium">
                病原体
              </th>
              <th colSpan={2} className="border border-neutral-300 px-2 py-2 font-medium">
                门急诊流感样病例
              </th>
              <th colSpan={2} className="border border-neutral-300 px-2 py-2 font-medium">
                住院严重急性呼吸道感染病例
              </th>
            </tr>
            <tr className="bg-neutral-50">
              <th className="border border-neutral-300 px-2 py-2 font-medium">第{table.report_week}周</th>
              <th className="border border-neutral-300 px-2 py-2 font-medium">较上周*</th>
              <th className="border border-neutral-300 px-2 py-2 font-medium">第{table.report_week}周</th>
              <th className="border border-neutral-300 px-2 py-2 font-medium">较上周*</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.pathogen}>
                <td className="border border-neutral-300 px-3 py-1.5">{row.pathogen}</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-center tabular-nums">
                  {formatRate(row.ili)}
                </td>
                <DeltaCell value={row.iliDelta} />
                <td className="border border-neutral-300 px-2 py-1.5 text-center tabular-nums">
                  {formatRate(row.sari)}
                </td>
                <DeltaCell value={row.sariDelta} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        注：“+”表示本周特定病原体检测阳性率数值较上周增加；“-”表示本周特定病原体检测阳性率数值较上周下降。
        {table.previousLabel ? ` 较上周对照：${table.previousLabel}。` : ""}
      </p>
    </section>
  );
}
