"use client";

import { PATHOGENS } from "@/lib/pathogens";
import type { SmoothWindow, TimeWindow } from "@/lib/data/parse";

const MAIN = new Set(["新型冠状病毒", "流感病毒", "呼吸道合胞病毒"]);

export type PeriodUnit = "week" | "month";

export type ToolbarItem = {
  name: string;
  color: string;
};

export type ToolbarPreset = {
  label: string;
  names: string[];
};

type Props = {
  timeWindow: TimeWindow;
  onTimeWindow: (w: TimeWindow) => void;
  smooth: SmoothWindow;
  onSmooth: (w: SmoothWindow) => void;
  unit?: PeriodUnit;
  items?: ToolbarItem[];
  selected?: Set<string>;
  onSelected?: (next: Set<string>) => void;
  presets?: ToolbarPreset[];
};

const TIME_OPTIONS: Record<PeriodUnit, { id: string; label: string }[]> = {
  week: [
    { id: "26", label: "近26周" },
    { id: "52", label: "近52周" },
    { id: "all", label: "全部" },
  ],
  month: [
    { id: "26", label: "近26月" },
    { id: "52", label: "近52月" },
    { id: "all", label: "全部" },
  ],
};

const SMOOTH_OPTIONS: Record<PeriodUnit, { id: string; label: string }[]> = {
  week: [
    { id: "1", label: "周值" },
    { id: "3", label: "3周均值" },
    { id: "5", label: "5周均值" },
  ],
  month: [
    { id: "1", label: "月值" },
    { id: "3", label: "3月均值" },
    { id: "5", label: "5月均值" },
  ],
};

export function ChartToolbar({
  timeWindow,
  onTimeWindow,
  smooth,
  onSmooth,
  unit = "week",
  items,
  selected,
  onSelected,
  presets,
}: Props) {
  const filterItems = items ?? (selected && onSelected ? PATHOGENS : undefined);
  const filterPresets =
    presets ??
    (filterItems
      ? [
          { label: "全部", names: filterItems.map((item) => item.name) },
          { label: "主要", names: [...MAIN] },
        ]
      : undefined);

  function toggle(name: string) {
    if (!selected || !onSelected) return;
    const next = new Set(selected);
    if (next.has(name)) {
      if (next.size === 1) return;
      next.delete(name);
    } else {
      next.add(name);
    }
    onSelected(next);
  }

  return (
    <div className="mb-4 space-y-2.5 text-xs">
      <div>
        <Seg
          value={String(timeWindow)}
          onChange={(v) => onTimeWindow(v === "all" ? "all" : (Number(v) as 26 | 52))}
          options={TIME_OPTIONS[unit]}
        />
      </div>
      <div>
        <Seg
          value={String(smooth)}
          onChange={(v) => onSmooth(Number(v) as SmoothWindow)}
          options={SMOOTH_OPTIONS[unit]}
        />
      </div>

      {filterItems && selected && onSelected ? (
        <div className="space-y-2">
          {filterPresets ? (
            <div className="flex flex-wrap items-center gap-2">
              {filterPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onSelected(new Set(preset.names))}
                  className={chipClass(sameSet(selected, preset.names))}
                >
                  {preset.label}
                </button>
              ))}
              <span className="font-mono text-muted-ink">
                已选 {selected.size} / {filterItems.length}
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {filterItems.map((item) => {
              const on = selected.has(item.name);
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.name)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 ${
                    on
                      ? "border-primary bg-hover-wash text-ink"
                      : "border-line bg-muted text-muted-ink hover:border-primary hover:bg-hover-wash hover:text-ink"
                  }`}
                >
                  <span
                    className="inline-block h-[0.125rem] w-3.5 shrink-0"
                    style={{ background: item.color, opacity: on ? 1 : 0.35 }}
                  />
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="inline-flex border border-line">
      {options.map((option) => {
        const on = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            className={`cursor-pointer px-2.5 py-1 ${
              on ? "bg-muted font-medium text-primary" : "bg-surface text-muted-ink hover:bg-hover-wash"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function chipClass(on: boolean) {
  return `cursor-pointer border px-2 py-1 ${
    on ? "border-primary bg-hover-wash font-medium text-primary" : "border-line bg-surface text-muted-ink hover:border-primary hover:bg-hover-wash"
  }`;
}

export function sameSet(selected: Set<string>, names: string[]) {
  if (names.length === 0) return false;
  if (selected.size !== names.length) return false;
  return names.every((n) => selected.has(n));
}

export { MAIN as MAIN_PATHOGENS };
