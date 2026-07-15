import type { ElementType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: string; positive: boolean };
  icon: ElementType;
  color?: "blue" | "green" | "cyan" | "red" | "amber" | "violet";
  /** Legacy alias */
  iconColor?: "indigo" | "green" | "red" | "amber" | "blue" | "violet" | "cyan";
}

const colorMap = {
  blue:   { box: "bg-sky-500/10 text-sky-600", val: "text-foreground" },
  green:  { box: "bg-emerald-500/10 text-emerald-600", val: "text-emerald-600" },
  cyan:   { box: "bg-cyan-500/10 text-cyan-600", val: "text-foreground" },
  red:    { box: "bg-destructive/10 text-destructive", val: "text-destructive" },
  amber:  { box: "bg-amber-500/10 text-amber-600", val: "text-foreground" },
  violet: { box: "bg-violet-500/10 text-violet-600", val: "text-foreground" },
};

const legacyMap: Record<string, keyof typeof colorMap> = {
  indigo: "blue",
  blue:   "blue",
  green:  "green",
  red:    "red",
  amber:  "amber",
  violet: "violet",
  cyan:   "cyan",
};

export function KpiCard({ label, value, subtitle, delta, icon: Icon, color, iconColor }: KpiCardProps) {
  const key = color ?? (iconColor ? legacyMap[iconColor] : undefined) ?? "blue";
  const c = colorMap[key as keyof typeof colorMap] ?? colorMap.blue;

  return (
    <div className="min-w-0 overflow-hidden rounded-[10px] border border-border bg-card p-3 shadow-sm">
      {/* Row 1: icon + delta */}
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex size-9 items-center justify-center rounded-lg ${c.box}`}>
          <Icon className="size-[18px]" />
        </div>
        {delta && (
          <div
            className={`flex items-center gap-[3px] rounded-full px-[7px] py-0.5 text-[11px] font-semibold ${
              delta.positive
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {delta.positive ? (
              <TrendingUp className="size-[11px]" />
            ) : (
              <TrendingDown className="size-[11px]" />
            )}
            {delta.value}
          </div>
        )}
      </div>

      {/* Row 2: value */}
      <div className={`mb-1 truncate text-xl font-extrabold leading-none tabular-nums ${c.val}`}>
        {value}
      </div>

      {/* Row 3: label */}
      <div className="truncate text-[11px] font-semibold leading-snug text-muted-foreground">
        {label}
      </div>

      {/* Row 4: subtitle */}
      {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
