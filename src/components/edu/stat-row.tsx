import type { CSSProperties } from "react";
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
  blue: "var(--palette-sky)",
  green: "var(--palette-green)",
  red: "var(--palette-coral)",
  amber: "var(--palette-coral)",
  violet: "var(--palette-grape)",
};

/**
 * Compact icon + number + label row for a dashboard's secondary-metrics
 * column — the quiet sibling next to a hero card, not a boxed KPI tile.
 */
export function StatRow({ label, value, icon: Icon, tone = "green" }: StatRowProps) {
  const toneColor = toneMap[tone];

  return (
    <div className="edu-card flex items-center gap-3 px-5 py-4">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/50"
        style={
          {
            background: `color-mix(in srgb, ${toneColor} 13%, white)`,
            color: toneColor,
          } as CSSProperties
        }
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</div>
        <div className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}
