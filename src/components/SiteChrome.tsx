"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CHART_DOWNLOAD_GROUPS, chartDownloadPath } from "@/lib/chart-downloads";
import { FORECAST_HUB, SITE_GITHUB, SITE_NAME } from "@/lib/links";
import { UnofficialBadge } from "@/components/SiteCopy";

const TOOLS = [
  { href: FORECAST_HUB, label: "预测竞技场" },
  { href: SITE_GITHUB, label: "GitHub" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page text-ink">
      <div className="flex h-[4.25rem] items-center gap-3 px-4 text-[0.9375rem] sm:gap-6 sm:px-5 sm:text-base">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold sm:text-lg">{SITE_NAME}</span>
          <UnofficialBadge variant="nav" />
        </Link>
        <nav className="ml-auto flex shrink-0 items-center gap-3 font-medium whitespace-nowrap sm:gap-5">
          <CsvMenu active={pathname === "/csv" || pathname === "/csv/"} />
          {TOOLS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={
                item.label === "GitHub"
                  ? "hidden text-muted-ink hover:text-primary hover:underline sm:inline"
                  : "text-muted-ink hover:text-primary hover:underline"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

const CSV_ITEM_CLASS =
  "block px-4 py-2.5 text-[0.9375rem] font-medium leading-snug whitespace-normal transition-colors duration-150 ease-out hover:bg-hover-wash hover:text-primary";

function CsvMenu({ active }: { active: boolean }) {
  return (
    <div className="group relative flex h-[4.25rem] items-center">
      <Link
        href="/csv"
        className={`inline-flex items-center gap-1 ${
          active
            ? "font-semibold text-primary underline decoration-primary decoration-2 underline-offset-[0.7em]"
            : "text-muted-ink group-hover:text-primary group-hover:underline"
        }`}
        aria-haspopup="menu"
      >
        CSV
        <ChevronRight
          aria-hidden
          className="size-[0.72em] translate-y-px transition-transform duration-200 ease-out group-hover:rotate-90 group-focus-within:rotate-90"
          strokeWidth={1.75}
        />
      </Link>
      <div
        role="menu"
        className="csv-menu-panel absolute top-full right-0 z-30 w-[min(20rem,calc(100vw-2.5rem))] origin-top-right pt-0.5 max-md:fixed max-md:top-[4.25rem] max-md:right-4 max-md:left-4 max-md:w-auto"
      >
        <div className="border border-line bg-surface py-2 font-normal whitespace-normal">
          {CHART_DOWNLOAD_GROUPS.map((group) => (
            <div key={group.section} className="py-1">
              <p className="px-4 pb-1 pt-2 text-[0.8125rem] font-medium text-muted-ink">{group.section}</p>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  role="menuitem"
                  href={chartDownloadPath(item.id)}
                  download={item.filename}
                  className={`${CSV_ITEM_CLASS} text-ink`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
          <div className="mt-1 border-t border-line">
            <Link href="/csv" role="menuitem" className={`${CSV_ITEM_CLASS} text-muted-ink`}>
              全部文件与字段说明
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-page">
      <div className="px-4 py-4 text-[0.6875rem] leading-relaxed text-muted-ink">
        本站为社区维护的<strong className="font-medium text-ink">非官方开源项目</strong>
        ，非正式中国 CDC 网站。依据中国 CDC 公开数据整理，原始数据知识产权属于中国疾病预防控制中心。
      </div>
    </footer>
  );
}
