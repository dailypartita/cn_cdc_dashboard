import Link from "next/link";
import { SITE_PAGES } from "@/lib/links";

const ENDPOINTS = [
  ["GET /api/v1/surveillance.json", "哨点长表（全量 JSON）"],
  ["GET /api/v1/latest.json", "最新周，表1 结构（含较上周）"],
  ["GET /api/v1/status.json", "各数据集最新期（目录日期同源）"],
  ["GET /api/v1/weeks.json", "已存档监测周列表"],
  ["GET /api/v1/pathogens.json", "哨点病原体中英名与 slug"],
  ["GET /api/v1/notifiable.json", "法定传染病月报长表（不含总计行）"],
  ["GET /api/v1/covid-variants.json", "新冠主要流行株周占比"],
];

export default function ApiDocsPage() {
  const origin = SITE_PAGES;
  return (
    <main className="px-6 py-8 lg:px-10">
      <h1 className="text-xl font-semibold">API</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-ink">
        静态 JSON，随每周入库重建。筛选请在客户端做，或改下{" "}
        <Link className="text-primary hover:underline" href="/csv">
          CSV / Parquet
        </Link>
        。curl / pandas 可直接读；GitHub Pages 不设自定义 CORS 头。
      </p>

      <table className="mt-8 w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-muted tracking-wide text-muted-ink uppercase">
            <th className="border border-line px-2 py-1.5 text-left font-medium">路径</th>
            <th className="border border-line px-2 py-1.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map(([path, desc]) => (
            <tr key={path}>
              <td className="border border-line bg-surface px-2 py-1.5 font-mono text-[12px]">{path}</td>
              <td className="border border-line bg-surface px-2 py-1.5 text-muted-ink">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <pre className="mt-6 overflow-x-auto border border-line bg-muted p-3 font-mono text-[12px] text-ink">
{`curl "${origin}/api/v1/latest.json"
curl "${origin}/api/v1/surveillance.json"`}
      </pre>
    </main>
  );
}
