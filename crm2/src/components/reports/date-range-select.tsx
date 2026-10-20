"use client";

import { CalendarRange, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deltaPct,
  formatRangeLabel,
  PRESET_KEYS,
  PRESET_LABELS,
  resolvePreset,
  type DateRange,
  type PresetKey,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  range: DateRange;
  preset: PresetKey;
  compare: boolean;
}

interface DateRangeSelectProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Shared date-range control used by the reports and dashboard pages.
 * Emits an inclusive local range plus the comparison flag; callers own URL
 * sync so the selection survives refreshes and is shareable.
 */
export function DateRangeSelect({ value, onChange, className, compact }: DateRangeSelectProps) {
  const selectPreset = (preset: PresetKey) => {
    if (preset === value.preset && preset !== "custom") return;
    if (preset === "custom") {
      onChange({ ...value, preset: "custom" });
      return;
    }
    onChange({ range: resolvePreset(preset), preset, compare: value.compare });
  };

  const setBound = (key: keyof DateRange, raw: string) => {
    const range = { ...value.range, [key]: raw };
    if (range.from > range.to) {
      if (key === "from") range.to = raw;
      else range.from = raw;
    }
    onChange({ range, preset: "custom", compare: value.compare });
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="space-y-2">
        <Label className="text-xs">Date range</Label>
        <Select
          value={value.preset}
          onValueChange={(v) => {
            if (v) selectPreset(v as PresetKey);
          }}
        >
          <SelectTrigger className="w-[168px]">
            <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_KEYS.filter((k) => k !== "custom").map((key) => (
              <SelectItem key={key} value={key}>
                {PRESET_LABELS[key]}
              </SelectItem>
            ))}
            <SelectItem value="custom">{PRESET_LABELS.custom}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="range-from">
          From
        </Label>
        <Input
          id="range-from"
          type="date"
          value={value.range.from}
          max={value.range.to}
          onChange={(e) => setBound("from", e.target.value)}
          className="w-[150px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="range-to">
          To
        </Label>
        <Input
          id="range-to"
          type="date"
          value={value.range.to}
          min={value.range.from}
          onChange={(e) => setBound("to", e.target.value)}
          className="w-[150px]"
        />
      </div>

      <label
        htmlFor="range-compare"
        className={cn(
          "flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50",
          compact && "h-9",
        )}
      >
        <Checkbox
          id="range-compare"
          checked={value.compare}
          onCheckedChange={(checked) =>
            onChange({ ...value, compare: checked === true })
          }
        />
        Compare previous period
      </label>

      <span className="pb-2.5 text-xs text-muted-foreground">
        {formatRangeLabel(value.range)}
      </span>
    </div>
  );
}

interface DeltaBadgeProps {
  current: number;
  previous: number;
  label?: string;
  className?: string;
}

/**
 * Percentage change pill for a current vs previous value. Renders `new`
 * instead of a fabricated percentage when the previous period was zero.
 */
export function DeltaBadge({ current, previous, label, className }: DeltaBadgeProps) {
  const pct = deltaPct(current, previous);
  const isUp = pct !== null && pct > 0;
  const isDown = pct !== null && pct < 0;
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px]", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold tabular-nums",
          pct === null && current > 0 && "bg-success/15 text-success",
          isUp && "bg-success/15 text-success",
          isDown && "bg-destructive/15 text-destructive",
          pct === null && current === 0 && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-2.5 w-2.5" aria-hidden />
        {pct === null ? (current > 0 ? "new" : "—") : `${pct > 0 ? "+" : ""}${pct}%`}
      </span>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
    </span>
  );
}
