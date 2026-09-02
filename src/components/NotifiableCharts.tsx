"use client";

import { useMemo, useState } from "react";
import {
  MAIN_NOTIFIABLE,
  chartableDiseases,
  colorForDisease,
  uniqueMonths,
  type NotifiableRecord,
} from "@/lib/data/notifiable";
import type { SmoothWindow, TimeWindow } from "@/lib/data/parse";
import { trailingMean } from "@/lib/data/parse";
import { CdcTrendChart } from "@/components/CdcTrendChart";
import { ChartToolbar } from "@/components/ChartToolbar";

type Metric = "cases" | "deaths";

export function NotifiableCharts({ records }: { records: NotifiableRecord[] }) {
  const diseases = useMemo(() => chartableDiseases(records), [records]);
  const monthsAll = useMemo(() => uniqueMonths(records), [records]);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(52);
  const [smooth, setSmooth] = useState<SmoothWindow>(1);
  const [selected, setSelected] = useState(() => new Set<string>(MAIN_NOTIFIABLE.filter((n) => diseases.includes(n))));

  const months =
    timeWindow === "all" ? monthsAll : monthsAll.slice(Math.max(0, monthsAll.length - timeWindow));
  const offset = monthsAll.length - months.length;
  const visible = [...selected].filter((name) => diseases.includes(name));
  const smoothHint = smooth === 1 ? undefined : `${smooth}月滑动平均`;

  const classNames = (klass: string) =>
    diseases.filter((name) => records.some((r) => r.disease === name && r.disease_class === klass));

  return (
    <div>
      <ChartToolbar
        unit="month"
        timeWindow={timeWindow}
        onTimeWindow={setTimeWindow}
        smooth={smooth}
        onSmooth={setSmooth}
        items={diseases.map((name) => ({ name, color: colorForDisease(name) }))}
        selected={selected}
        onSelected={setSelected}
        presets={[
          { label: "全部", names: diseases },
          { label: "主要", names: MAIN_NOTIFIABLE.filter((n) => diseases.includes(n)) },
          { label: "乙类", names: classNames("乙类") },
          { label: "丙类", names: classNames("丙类") },
        ]}
      />

      <MetricChart
        id="notifiable-cases"
        title="法定传染病分病原月报告发病数"
        metric="cases"
        yLabel="发病数"
        monthsAll={monthsAll}
        offset={offset}
        length={months.length}
        records={records}
        selected={visible}
        smooth={smooth}
        smoothHint={smoothHint}
      />
      <MetricChart
        id="notifiable-deaths"
        title="法定传染病分病原月报告死亡数"
        metric="deaths"
        yLabel="死亡数"
        monthsAll={monthsAll}
        offset={offset}
        length={months.length}
        records={records}
        selected={visible}
        smooth={smooth}
        smoothHint={smoothHint}
      />
    </div>
  );
}

function MetricChart({
  id,
  title,
  metric,
  yLabel,
  monthsAll,
  offset,
  length,
  records,
  selected,
  smooth,
  smoothHint,
}: {
  id: string;
  title: string;
  metric: Metric;
  yLabel: string;
  monthsAll: { month: string; label: string }[];
  offset: number;
  length: number;
  records: NotifiableRecord[];
  selected: string[];
  smooth: SmoothWindow;
  smoothHint?: string;
}) {
  const byKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      map.set(`${r.month}|${r.disease}|${metric}`, r[metric]);
    }
    return map;
  }, [records, metric]);

  const months = monthsAll.slice(offset, offset + length);
  const series = selected.map((name) => ({
    name,
    color: colorForDisease(name),
    data: trailingMean(
      monthsAll.map((m) => byKey.get(`${m.month}|${name}|${metric}`) ?? null),
      smooth,
      0,
    ).slice(offset, offset + length),
  }));

  const max = Math.max(0, ...series.flatMap((s) => s.data.filter((v): v is number => v != null)));
  const useWan = metric === "cases" && max >= 10_000;

  return (
    <CdcTrendChart
      id={id}
      title={title}
      labels={months.map((m) => m.label)}
      series={series}
      yLabel={useWan ? `${yLabel}（万）` : yLabel}
      scale="count"
      smoothHint={smoothHint}
      formatTick={useWan ? (v) => String(Math.round(v / 10_000)) : (v) => v.toLocaleString("zh-CN")}
      formatValue={(v) => `${v.toLocaleString("zh-CN")}${metric === "cases" ? " 例" : " 人"}`}
    />
  );
}
