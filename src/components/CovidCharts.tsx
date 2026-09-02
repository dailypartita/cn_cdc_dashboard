"use client";

import { useMemo, useState } from "react";
import type { SmoothWindow, SurveillanceRecord, TimeWindow } from "@/lib/data/parse";
import { sliceWeeks, trailingMean, uniqueWeeks } from "@/lib/data/parse";
import { ChartToolbar } from "@/components/ChartToolbar";
import { CdcTrendChart } from "@/components/CdcTrendChart";

export function CovidCharts({ records }: { records: SurveillanceRecord[] }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [smooth, setSmooth] = useState<SmoothWindow>(1);

  const covid = useMemo(
    () => records.filter((r) => r.pathogen === "新型冠状病毒"),
    [records],
  );
  const weeksAll = useMemo(() => uniqueWeeks(covid), [covid]);
  const weeks = useMemo(() => sliceWeeks(weeksAll, timeWindow), [weeksAll, timeWindow]);
  const offset = weeksAll.length - weeks.length;

  const ili = useMemo(
    () => trailingMean(weeksAll.map((w) => valueAt(covid, w.reference_date, "ili")), smooth).slice(offset),
    [covid, weeksAll, offset, smooth],
  );
  const sari = useMemo(
    () => trailingMean(weeksAll.map((w) => valueAt(covid, w.reference_date, "sari")), smooth).slice(offset),
    [covid, weeksAll, offset, smooth],
  );

  const smoothHint = smooth === 1 ? undefined : `${smooth}周滑动平均`;

  return (
    <div>
      <ChartToolbar
        timeWindow={timeWindow}
        onTimeWindow={setTimeWindow}
        smooth={smooth}
        onSmooth={setSmooth}
      />
      <CdcTrendChart
        id="covid-positivity"
        title="哨点医院新冠病毒核酸检测阳性率"
        labels={weeks.map((w) => w.label)}
        series={[
          { name: "门急诊 ILI", color: "#2E75B6", data: ili },
          { name: "住院 SARI", color: "#C00000", data: sari },
        ]}
        yLabel="阳性率(%)"
        smoothHint={smoothHint}
      />
    </div>
  );
}

function valueAt(
  records: SurveillanceRecord[],
  date: string,
  metric: "ili" | "sari",
): number | null {
  const row = records.find((r) => r.reference_date === date);
  if (!row) return null;
  return metric === "ili" ? row.ili_percent : row.sari_percent;
}
