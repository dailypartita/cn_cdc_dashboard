"use client";

import { useMemo, useState } from "react";
import { CdcTrendChart } from "@/components/CdcTrendChart";
import { ChartToolbar } from "@/components/ChartToolbar";
import { cnicWeekAxis, shareOfPositives, type CnicWeek } from "@/lib/data/cnic";
import { sliceWeeks, trailingMean, type SmoothWindow, type TimeWindow } from "@/lib/data/parse";

const SOUTH = "#C45911";
const NORTH = "#2E75B6";
const NATIONAL = "#548235";

export function CnicFluCharts({ records }: { records: CnicWeek[] }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(52);
  const [smooth, setSmooth] = useState<SmoothWindow>(1);

  const weeksAll = useMemo(() => records.map(cnicWeekAxis), [records]);
  const weeks = useMemo(() => sliceWeeks(weeksAll, timeWindow), [weeksAll, timeWindow]);
  const offset = weeksAll.length - weeks.length;
  const labels = weeks.map((week) => week.label);
  const smoothHint = smooth === 1 ? undefined : `${smooth}周滑动平均`;

  const ili = useMemo(() => {
    const south = trailingMean(records.map((row) => row.ili_south), smooth).slice(offset);
    const north = trailingMean(records.map((row) => row.ili_north), smooth).slice(offset);
    return [
      { name: "南方", color: SOUTH, data: south },
      { name: "北方", color: NORTH, data: north },
    ];
  }, [records, smooth, offset]);

  const positivity = useMemo(() => {
    const slice = (values: (number | null)[]) => trailingMean(values, smooth).slice(offset);
    return [
      { name: "南方", color: SOUTH, data: slice(records.map((row) => row.positivity_south)) },
      { name: "北方", color: NORTH, data: slice(records.map((row) => row.positivity_north)) },
      { name: "全国", color: NATIONAL, data: slice(records.map((row) => row.positivity_national)) },
    ];
  }, [records, smooth, offset]);

  const subtypes = useMemo(() => {
    const share = (pick: (row: CnicWeek) => number | null) =>
      trailingMean(
        records.map((row) => shareOfPositives(pick(row), row.positives_national)),
        smooth,
      ).slice(offset);
    return [
      { name: "A(H1N1)pdm09", color: "#ED7D31", data: share((row) => row.h1_national) },
      { name: "A(H3N2)", color: "#C45911", data: share((row) => row.h3_national) },
      { name: "B/Victoria", color: "#2E75B6", data: share((row) => row.bvic_national) },
      { name: "B/Yamagata", color: "#7030A0", data: share((row) => row.byam_national) },
    ];
  }, [records, smooth, offset]);

  return (
    <div>
      <ChartToolbar timeWindow={timeWindow} onTimeWindow={setTimeWindow} smooth={smooth} onSmooth={setSmooth} />
      <CdcTrendChart
        id="cnic-ili"
        title="哨点医院流感样病例百分比（ILI%）"
        labels={labels}
        series={ili}
        yLabel="ILI%"
        yMax={axisMax(ili.flatMap((series) => series.data), 30)}
        smoothHint={smoothHint}
      />
      <CdcTrendChart
        id="cnic-positivity"
        title="ILI 标本流感病毒检测阳性率"
        labels={labels}
        series={positivity}
        yLabel="阳性率(%)"
        yMax={axisMax(positivity.flatMap((series) => series.data), 100)}
        smoothHint={smoothHint}
      />
      <CdcTrendChart
        id="cnic-subtypes"
        title="全国流感阳性标本型别构成"
        labels={labels}
        series={subtypes}
        yLabel="占阳性标本(%)"
        yMax={axisMax(subtypes.flatMap((series) => series.data), 100)}
        smoothHint={smoothHint}
      />
    </div>
  );
}

function axisMax(values: (number | null)[], cap: number): number {
  const kept = values.filter((value): value is number => value != null && value >= 0 && value <= cap);
  const max = kept.length ? Math.max(...kept) : 5;
  return Math.min(cap, Math.max(5, Math.ceil((max * 1.08) / 5) * 5));
}
