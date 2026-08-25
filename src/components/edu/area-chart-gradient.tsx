import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface AreaSeriesSpec {
  dataKey: string;
  name: string;
  color: string;
}

interface AreaChartGradientProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: AreaSeriesSpec[];
  height?: number;
  valueFormatter?: (value: number) => string;
}

/**
 * Recharts AreaChart with a fade-to-transparent gradient under each line —
 * the pattern already used ad hoc on the Director Dashboard revenue chart,
 * extracted so new charts don't copy-paste the defs/gradient boilerplate.
 */
export function AreaChartGradient({ data, xKey, series, height = 260, valueFormatter }: AreaChartGradientProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.dataKey} id={`acg-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          formatter={(value: number, name: string) => [valueFormatter ? valueFormatter(value) : value, name]}
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            fill={`url(#acg-${s.dataKey})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
