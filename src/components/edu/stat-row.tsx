import type { ComponentType } from "react";

interface StatRowProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  /**
   * Semantic tint, kept meaningful in both themes — styles.css defines a
   * muted dark-mode variant per tone (`.dark .kpi-glass .kpi-ic.tone-*`) so
   * "amber = warning" etc. isn't lost switching themes, just toned down.
   */
  tone?: "blue" | "green" | "red" | "amber" | "violet";
}

const toneMap: Record<NonNullable<StatRowProps["tone"]>, string> = {
  blue: "bg-sky-500/10 text-sky-600",
  green: "bg-emerald-500/10 text-emerald-600",
  red: "bg-destructive/10 text-destructive",
  amber: "bg-amber-500/10 text-amber-600",
  violet: "bg-violet-500/10 text-violet-600",
};

/**
 * Compact icon + number + label row for a dashboard's secondary-metrics
 * column — the quiet sibling next to a hero card, not a boxed KPI tile.
 */
export function StatRow({ label, value, icon: Icon, tone = "green" }: StatRowProps) {
  return (
    <div className="kpi-glass glass-surface flex items-center gap-3 rounded-2xl px-5 py-4">
      <div className={`kpi-ic tone-${tone} glow-icon flex size-11 shrink-0 items-center justify-center rounded-xl ${toneMap[tone]}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</div>
        <div className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
