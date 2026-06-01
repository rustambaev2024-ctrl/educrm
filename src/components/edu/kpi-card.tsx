import type { ElementType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: string; positive: boolean };
  icon: ElementType;
  color?: "blue" | "green" | "cyan" | "red" | "amber";
  /** Legacy alias */
  iconColor?: "indigo" | "green" | "red" | "amber" | "blue" | "violet" | "cyan";
}

const colorMap = {
  blue:  { bg: "#e0f2fe", icon: "#0077b6", val: "#0077b6" },
  green: { bg: "#dcfce7", icon: "#008000", val: "#008000" },
  cyan:  { bg: "#caf0f8", icon: "#00b4d8", val: "#00b4d8" },
  red:   { bg: "#fee2e2", icon: "#dc2626", val: "#dc2626" },
  amber: { bg: "#fef3c7", icon: "#d97706", val: "#d97706" },
};

const legacyToNew: Record<string, keyof typeof colorMap> = {
  indigo: "blue",
  violet: "blue",
  blue: "blue",
  green: "green",
  red: "red",
  amber: "amber",
  cyan: "cyan",
};

export function KpiCard({ label, value, subtitle, delta, icon: Icon, color, iconColor }: KpiCardProps) {
  const resolvedKey = color ?? (iconColor ? legacyToNew[iconColor] : undefined) ?? "blue";
  const c = colorMap[resolvedKey as keyof typeof colorMap] ?? colorMap.blue;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        border: "1.5px solid #e0f2fe",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,119,182,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 9,
          background: c.bg,
          marginBottom: 10,
        }}
      >
        <Icon style={{ width: 20, height: 20, color: c.icon }} />
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: c.val,
          marginBottom: 4,
        }}
      >
        {label}
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: c.val, lineHeight: 1 }}>
        {value}
      </div>

      {subtitle && (
        <div style={{ fontSize: 11, color: "#90e0ef", marginTop: 3 }}>{subtitle}</div>
      )}

      {delta && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            marginTop: 8,
            color: delta.positive ? "#008000" : "#dc2626",
          }}
        >
          {delta.positive ? <TrendingUp style={{ width: 12, height: 12 }} /> : <TrendingDown style={{ width: 12, height: 12 }} />}
          {delta.value}
        </div>
      )}
    </div>
  );
}
