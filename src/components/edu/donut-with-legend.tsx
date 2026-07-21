import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutWithLegendProps {
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  /** Emerald glow around the ring (visible in dark theme; a no-op in light). */
  glow?: boolean;
}

/**
 * Donut chart (recharts Pie with an inner radius) + a legend list to its
 * side showing label/value per segment — the "Payment Status" pattern from
 * the design reference, generalized for any categorical breakdown with
 * real data (e.g. attendance present/late/absent/excused).
 */
export function DonutWithLegend({ segments, centerLabel, centerValue, size = 160, glow = false }: DonutWithLegendProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex items-center gap-6">
      <div className={`relative flex-shrink-0 ${glow ? "donut-glow" : ""}`} style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {segments.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <div className="text-xl font-bold tabular-nums text-foreground">{centerValue}</div>}
            {centerLabel && <div className="text-[10px] text-muted-foreground">{centerLabel}</div>}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 flex-shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
              <span className="flex-shrink-0 font-semibold tabular-nums">{s.value}</span>
              <span className="w-9 flex-shrink-0 text-right text-xs text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
