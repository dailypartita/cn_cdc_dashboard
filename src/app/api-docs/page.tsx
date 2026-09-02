import { DATA_REVALIDATE } from "@/lib/data/cache";

export const revalidate = DATA_REVALIDATE;

const ENDPOINTS = [
  [
    "GET /api/v1/surveillance",
    "长表。参数：pathogen（中文名或 slug）、start、end（reference_date）、format=json|csv|parquet",
  ],
  ["GET /api/v1/latest", "最新周，表1 结构（含较上周）"],
  ["GET /api/v1/status", "各数据集最新期（目录日期同源）"],
  ["GET /api/v1/weeks", "已存档监测周列表"],
  ["GET /api/v1/pathogens", "哨点病原体中英名与 slug"],
  ["GET /api/v1/notifiable", "法定传染病月报长表。参数：disease、class、start、end（YYYY-MM）、summary=1、format=json|csv|parquet"],
  ["GET /api/v1/covid-variants", "新冠主要流行株周占比。参数：lineage、start、end（week_start）、format=json|csv|parquet"],
];

export default function ApiDocsPage() {
  return (
    <main className="px-6 py-8 lg:px-10">
      <h1 className="text-xl font-bold">API</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">
        只读、免密钥、开放 CORS。默认 JSON，加 <code className="text-[12px]">format=csv</code> 或{" "}
        <code className="text-[12px]">format=parquet</code> 可改格式。
      </p>

      <table className="mt-8 w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border border-neutral-200 px-2 py-1.5 text-left font-medium">路径</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map(([path, desc]) => (
            <tr key={path}>
              <td className="border border-neutral-200 px-2 py-1.5 font-mono text-[12px]">{path}</td>
              <td className="border border-neutral-200 px-2 py-1.5 text-neutral-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <pre className="mt-6 overflow-x-auto border border-neutral-200 bg-neutral-50 p-3 text-[12px] text-neutral-700">
{`curl "/api/v1/surveillance?pathogen=sars-cov-2&start=2026-01-01&format=csv"
curl "/api/v1/latest"`}
      </pre>
    </main>
  );
}
