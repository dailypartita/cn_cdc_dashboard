"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { isAxisOutlier, yAxisMax } from "@/lib/data/parse";

export type ChartSeries = {
  name: string;
  color: string;
  data: (number | null)[];
};

type Scale = "percent" | "count";

type RankedItem = {
  name: string;
  color: string;
  value: number;
};

type Props = {
  id: string;
  title: string;
  labels: string[];
  series: ChartSeries[];
  yLabel: string;
  smoothHint?: string;
  scale?: Scale;
  formatTick?: (value: number) => string;
  formatValue?: (value: number) => string;
  yMax?: number;
};

const DEFAULT_RANK = 10;

export function CdcTrendChart({
  id,
  title,
  labels,
  series,
  yLabel,
  smoothHint,
  scale = "percent",
  formatTick,
  formatValue,
  yMax,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const tick = formatTick ?? (scale === "percent" ? (v: number) => String(v) : (v: number) => v.toLocaleString("zh-CN"));
  const valueText =
    formatValue ?? (scale === "percent" ? (v: number) => `${v.toFixed(1)}%` : (v: number) => v.toLocaleString("zh-CN"));

  const ymax = useMemo(() => {
    if (yMax != null) return yMax;
    if (scale === "percent") {
      const values = series.flatMap((s) => s.data.map((value) => ({ pathogen: s.name, value })));
      return yAxisMax(values);
    }
    const kept = series.flatMap((s) => s.data).filter((v): v is number => v != null);
    const m = kept.length ? Math.max(...kept) : 0;
    return niceCountMax(m);
  }, [yMax, scale, series]);

  const hasOutlier =
    scale === "percent" && yMax == null && series.some((s) => s.data.some((v) => isAxisOutlier(s.name, v)));

  const rows = useMemo(
    () =>
      labels.map((label, i) => {
        const row: Record<string, string | number | null> = { label };
        for (const s of series) row[s.name] = s.data[i];
        return row;
      }),
    [labels, series],
  );

  const seriesKey = series.map((s) => s.name).join("\0");
  useEffect(() => {
    setExpanded(false);
  }, [seriesKey]);

  const activeIndex = hoverIndex ?? Math.max(0, labels.length - 1);
  const ranked = useMemo<RankedItem[]>(
    () =>
      series
        .filter((s) => typeof s.data[activeIndex] === "number")
        .map((s) => ({
          name: s.name,
          color: s.color,
          value: s.data[activeIndex] as number,
        }))
        .sort((a, b) => b.value - a.value),
    [series, activeIndex],
  );

  const rotateTicks = labels.length > 20;
  const showDots = series.length <= 4;

  function onMove(state: MouseHandlerDataParam) {
    const next = toIndex(state.activeTooltipIndex ?? state.activeIndex);
    if (next == null) return;
    setHoverIndex((prev) => (prev === next ? prev : next));
  }

  return (
    <section id={id} className="mt-6 scroll-mt-20">
      <h3 className="mb-2 text-center text-[15px] font-bold text-neutral-900">{title}</h3>
      <div className="border border-neutral-200 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={rows}
                  margin={{ top: 8, right: 16, bottom: rotateTicks ? 8 : 0, left: 8 }}
                  onMouseMove={onMove}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <CartesianGrid stroke="#eeeeee" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#555" }}
                    tickLine={false}
                    axisLine={{ stroke: "#ddd" }}
                    minTickGap={22}
                    height={rotateTicks ? 58 : 32}
                    angle={rotateTicks ? -40 : 0}
                    textAnchor={rotateTicks ? "end" : "middle"}
                  />
                  <YAxis
                    domain={[0, ymax]}
                    tick={{ fontSize: 11, fill: "#555" }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={tick}
                    label={{
                      value: yLabel,
                      angle: -90,
                      position: "insideLeft",
                      offset: 2,
                      style: { fontSize: 11, fill: "#555" },
                    }}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    cursor={{ stroke: "#bbbbbb", strokeDasharray: "3 3" }}
                    content={() => null}
                  />
                  {series.map((s) => (
                    <Line
                      key={s.name}
                      type="linear"
                      dataKey={s.name}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={series.length <= 3 ? 2 : 1.5}
                      dot={showDots ? { r: 3, strokeWidth: 0, fill: s.color } : false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: s.color }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <RankedBarPanel
            label={labels[activeIndex] ?? ""}
            hint={smoothHint}
            items={ranked}
            formatValue={valueText}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        </div>
      </div>
      {hasOutlier && !smoothHint ? (
        <p className="mt-2 text-xs text-neutral-500">
          个别周次仍有未校正的极端高值，纵轴按其余序列缩放，悬停仍显示原始数值。已知 OCR 错位已按官方表1回补。
        </p>
      ) : null}
    </section>
  );
}

function RankedBarPanel({
  label,
  hint,
  items,
  formatValue,
  expanded,
  onToggle,
}: {
  label: string;
  hint?: string;
  items: RankedItem[];
  formatValue: (value: number) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const positive = items.filter((item) => item.value > 0);
  const collapsed = positive.slice(0, DEFAULT_RANK);
  const shouldFold = positive.length > DEFAULT_RANK;
  const shown = expanded ? items : collapsed;
  const hidden = Math.max(0, items.length - collapsed.length);
  const max = Math.max(1, ...shown.map((item) => item.value));

  return (
    <aside
      data-rank-panel
      className="flex w-full shrink-0 flex-col border-t border-neutral-200 lg:w-[280px] lg:border-t-0 lg:border-l"
    >
      <div className="px-3 py-1.5">
        <p className="text-[13px] font-medium leading-tight text-neutral-800">
          {label}
          {hint ? `（${hint}）` : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
        {shown.length === 0 ? (
          <p className="text-[12px] text-neutral-400">该时点无检出或未选病原</p>
        ) : (
          shown.map((item, i) => (
            <div key={item.name} className="py-[3px] text-[11px] leading-tight">
              <div className="flex items-baseline justify-between gap-1.5">
                <span className="min-w-0 truncate" title={item.name} style={{ color: item.color }}>
                  {i + 1}. {item.name}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-700">{formatValue(item.value)}</span>
              </div>
              <div className="mt-px h-1.5 bg-neutral-100">
                <div
                  className="h-full"
                  style={{
                    width: `${item.value > 0 ? Math.max(1.2, (item.value / max) * 100) : 0}%`,
                    background: item.color,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
      {shouldFold ? (
        <div className="px-3 py-1">
          <button
            type="button"
            onClick={onToggle}
            className="cursor-pointer text-[12px] text-[#1b6bb8] hover:underline"
          >
            {expanded ? "收起，仅前 10 种" : `展开其余 ${hidden} 种`}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function toIndex(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function niceCountMax(maxValue: number) {
  if (maxValue <= 0) return 1;
  const padded = maxValue * 1.08;
  const mag = 10 ** Math.floor(Math.log10(padded));
  for (const k of [1, 2, 2.5, 5, 10]) {
    const step = k * mag;
    const rounded = Math.ceil(padded / step) * step;
    if (rounded >= padded) return rounded;
  }
  return Math.ceil(padded / mag) * mag;
}
