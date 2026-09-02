"use client";

import { useMemo, useState } from "react";
import { MAIN_PATHOGENS } from "@/components/ChartToolbar";
import { PATHOGENS } from "@/lib/pathogens";
import type { SmoothWindow, SurveillanceRecord, TimeWindow } from "@/lib/data/parse";
import {
  seriesByPathogen,
  sliceWeeks,
  trailingMean,
  uniqueWeeks,
} from "@/lib/data/parse";
import { ChartToolbar } from "@/components/ChartToolbar";
import { CdcTrendChart } from "@/components/CdcTrendChart";

export function BulletinCharts({ records }: { records: SurveillanceRecord[] }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(52);
  const [smooth, setSmooth] = useState<SmoothWindow>(1);
  const [selected, setSelected] = useState(() => new Set(MAIN_PATHOGENS));

  const weeksAll = useMemo(() => uniqueWeeks(records), [records]);
  const weeks = useMemo(() => sliceWeeks(weeksAll, timeWindow), [weeksAll, timeWindow]);
  const offset = weeksAll.length - weeks.length;

  const iliSeries = useMemo(
    () => buildVisible(records, weeksAll, weeks, offset, "ili", smooth, selected),
    [records, weeksAll, weeks, offset, smooth, selected],
  );
  const sariSeries = useMemo(
    () => buildVisible(records, weeksAll, weeks, offset, "sari", smooth, selected),
    [records, weeksAll, weeks, offset, smooth, selected],
  );

  const labels = weeks.map((w) => w.label);
  const smoothHint = smooth === 1 ? undefined : `${smooth}周滑动平均`;

  return (
    <div>
      <ChartToolbar
        timeWindow={timeWindow}
        onTimeWindow={setTimeWindow}
        smooth={smooth}
        onSmooth={setSmooth}
        selected={selected}
        onSelected={setSelected}
      />
      <CdcTrendChart
        id="sentinel-ili"
        title="门急诊流感样病例（ILI）病原体核酸检测阳性率"
        labels={labels}
        series={iliSeries}
        yLabel="阳性率(%)"
        smoothHint={smoothHint}
      />
      <CdcTrendChart
        id="sentinel-sari"
        title="住院严重急性呼吸道感染（SARI）病原体核酸检测阳性率"
        labels={labels}
        series={sariSeries}
        yLabel="阳性率(%)"
        smoothHint={smoothHint}
      />
    </div>
  );
}

function buildVisible(
  records: SurveillanceRecord[],
  weeksAll: ReturnType<typeof uniqueWeeks>,
  weeks: ReturnType<typeof uniqueWeeks>,
  offset: number,
  metric: "ili" | "sari",
  smooth: SmoothWindow,
  selected: Set<string>,
) {
  return seriesByPathogen(records, weeksAll, metric, PATHOGENS)
    .filter((s) => selected.has(s.name))
    .map((s) => ({
      name: s.name,
      color: s.color,
      data: trailingMean(s.data, smooth).slice(offset, offset + weeks.length),
    }));
}
