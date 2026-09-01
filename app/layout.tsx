import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

const serif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "全国急性呼吸道传染病哨点监测",
  description:
    "中国 CDC 哨点医院呼吸道病原体监测周报的交互图表与开放数据（CSV / API）。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white font-sans text-neutral-900">{children}</body>
    </html>
  );
}
