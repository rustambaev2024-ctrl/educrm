import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

type IconColor = "blue" | "green" | "red" | "amber" | "violet";

const ICON_STYLES: Record<IconColor, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export function KpiCard({
  label,
  value,
  subtitle,
  delta,
  icon: Icon,
  iconColor = "blue",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: string; positive: boolean };
  icon: LucideIcon;
  iconColor?: IconColor;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-[22px] font-medium leading-tight text-foreground">{value}</div>
          {(subtitle || delta) && (
            <div className="mt-1 flex items-center gap-2">
              {delta && (
                <span
                  className={`flex items-center gap-0.5 text-[11px] font-medium ${
                    delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {delta.positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {delta.value}
                </span>
              )}
              {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}
            </div>
          )}
        </div>
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_STYLES[iconColor]}`}>
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}
