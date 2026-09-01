import Link from "next/link";

export function SiteHeader({ latestLabel }: { latestLabel?: string }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-[1100px] items-baseline justify-between gap-4 px-4 py-4">
        <div>
          <Link href="/" className="text-[15px] font-medium text-neutral-800">
            全国急性呼吸道传染病哨点监测
          </Link>
          {latestLabel ? (
            <p className="mt-1 text-xs text-neutral-500">最新监测周：{latestLabel}</p>
          ) : null}
        </div>
        <nav className="flex gap-5 text-sm text-neutral-600">
          <Link href="/" className="hover:text-neutral-950">
            监测周报
          </Link>
          <Link href="/data" className="hover:text-neutral-950">
            开放数据
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-[1100px] space-y-2 px-4 py-6 text-xs leading-relaxed text-neutral-500">
        <p>
          数据来源于中国疾病预防控制中心全国急性呼吸道传染病哨点监测周报，经{" "}
          <a
            className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-800"
            href="https://github.com/dailypartita/cn_cdc_crawl"
          >
            cn_cdc_crawl
          </a>{" "}
          结构化后同步存档。阳性率为哨点医院采样检测阳性率，不代表人群发病率。
        </p>
        <p>
          原始数据知识产权属于中国疾病预防控制中心。本站仅供非商业研究与分析使用。广州实验室 ·
          计算流行病学组 · yang_kaixin@gzlab.ac.cn
        </p>
      </div>
    </footer>
  );
}
