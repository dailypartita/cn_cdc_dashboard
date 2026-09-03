import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter, TopNav } from "@/components/SiteChrome";
import { SITE_NAME, SITE_TITLE } from "@/lib/links";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: `${SITE_NAME} 是基于中国 CDC 公开数据的非官方开源项目，整理法定传染病、急性呼吸道哨点监测与新冠感染疫情。非正式官方站点。`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full scroll-smooth antialiased">
      <body className="flex min-h-full flex-col bg-white font-sans text-neutral-900">
        <TopNav />
        <div className="min-w-0 flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
