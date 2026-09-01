"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import type { SurveillanceRecord, Metric } from "@/lib/data/parse";
import {
  seriesByPathogen,
  sliceWeeks,
  uniqueWeeks,
  yAxisMax,
  isAxisOutlier,
} from "@/lib/data/parse";

type WindowSize = 26 | 52 | "all";

type Props = {
  records: SurveillanceRecord[];
  metric: Metric;
  figure: "2" | "3";
  title: string;
};

export function CdcTrendChart({ records, metric, figure, title }: Props) {
  const [windowSize, setWindowSize] = useState<WindowSize>(52);
  const weeksAll = useMemo(() => uniqueWeeks(records), [records]);
  const weeks = useMemo(() => sliceWeeks(weeksAll, windowSize), [weeksAll, windowSize]);
  const series = useMemo(() => seriesByPathogen(records, weeks, metric), [records, weeks, metric]);

  const ymax = useMemo(() => {
    const values = series.flatMap((s) => s.data.map((value) => ({ pathogen: s.name, value })));
    return yAxisMax(values);
  }, [series]);

  const hasOutlier = useMemo(
    () => series.some((s) => s.data.some((v) => isAxisOutlier(s.name, v))),
    [series],
  );

  const option: EChartsOption = useMemo(
    () => ({
      animationDuration: 300,
      color: series.map((s) => s.color),
      legend: {
        type: "scroll",
        bottom: 0,
        data: series.map((s) => s.name),
        textStyle: { fontSize: 12, color: "#333" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        order: "valueDesc",
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const head = String(params[0].axisValue);
          const lines = params
            .filter((p) => p.value != null && p.value !== "-")
            .map((p) => {
              const v = Number(p.value);
              return `${p.marker} ${p.seriesName}：${v.toFixed(1)}%`;
            });
          return [head, ...lines].join("<br/>");
        },
      },
      toolbox: {
        right: 8,
        top: 0,
        feature: {
          saveAsImage: {
            title: "导出 PNG",
            name: `图${figure}_${metric === "ili" ? "门急诊ILI" : "住院SARI"}阳性率`,
            pixelRatio: 2,
          },
        },
      },
      grid: { left: 52, right: 24, top: 40, bottom: 88 },
      xAxis: {
        type: "category",
        data: weeks.map((w) => w.label),
        boundaryGap: false,
        axisLabel: {
          rotate: weeks.length > 20 ? 40 : 0,
          fontSize: 11,
          color: "#444",
          interval: weeks.length > 40 ? 3 : weeks.length > 20 ? 1 : 0,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        name: "阳性率(%)",
        nameTextStyle: { color: "#444" },
        min: 0,
        max: ymax,
        axisLabel: { formatter: "{value}" },
        splitLine: { lineStyle: { color: "#e5e5e5" } },
      },
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        data: s.data,
        connectNulls: false,
        showSymbol: true,
        symbol: s.symbol,
        symbolSize: 8,
        lineStyle: { width: 1.6, color: s.color },
        itemStyle: { color: s.color },
      })),
    }),
    [figure, metric, series, weeks, ymax],
  );

  return (
    <section className="mt-12">
      <h2 className="mb-1 text-center font-serif text-[17px] font-semibold text-neutral-900">
        图{figure} {title}
      </h2>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        {([26, 52, "all"] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindowSize(w)}
            className={`rounded border px-2.5 py-1 ${
              windowSize === w
                ? "border-neutral-800 bg-neutral-800 text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
            }`}
          >
            {w === "all" ? "全部" : `近${w}周`}
          </button>
        ))}
        <span className="ml-2 text-neutral-400">点击图例可显隐病原体 · 右上角导出 PNG</span>
      </div>
      <div className="rounded border border-neutral-200 bg-white">
        <ReactECharts option={option} style={{ height: 460 }} notMerge lazyUpdate />
      </div>
      {hasOutlier ? (
        <p className="mt-2 text-xs text-neutral-500">
          个别周次存在疑似抽取异常的高值（如鼻病毒 ILI &gt; 25%），纵轴按其余序列缩放，悬停仍显示原始数值。
        </p>
      ) : null}
    </section>
  );
}
