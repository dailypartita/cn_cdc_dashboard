import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteFooter, TopNav } from "@/components/SiteChrome";
import { SITE_NAME, SITE_TITLE } from "@/lib/links";

// Self-hosted so `next build` does not fetch fonts.googleapis.com. Turbopack
// fails that fetch with "next/font/google queries have exactly one entry"
// (vercel/next.js#99114), which blocked the Pages deploy after CDC ingest.
const plexSans = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-sans",
});

const notoSansSc = localFont({
  src: [
    { path: "../fonts/noto-sans-sc-chinese-simplified-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/noto-sans-sc-chinese-simplified-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/noto-sans-sc-chinese-simplified-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans-sc",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: `${SITE_NAME} 是基于中国 CDC 公开数据的非官方开源项目，整理法定传染病、急性呼吸道哨点监测与新冠感染疫情。非正式官方站点。`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${plexSans.variable} ${notoSansSc.variable} ${plexMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page font-sans text-ink">
        <TopNav />
        <div className="min-w-0 flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
