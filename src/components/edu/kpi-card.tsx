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
  blue:   { bg: "#dbeafe", icon: "#0077b6", val: "#0f172a" },
  green:  { bg: "#dcfce7", icon: "#16a34a", val: "#16a34a" },
  cyan:   { bg: "#e0f2fe", icon: "#00b4d8", val: "#0f172a" },
  red:    { bg: "#fee2e2", icon: "#dc2626", val: "#dc2626" },
  amber:  { bg: "#fef3c7", icon: "#d97706", val: "#0f172a" },
  violet: { bg: "#f3e8ff", icon: "#7c3aed", val: "#0f172a" },
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
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #f1f5f9",
        padding: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        minWidth: 0,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Row 1: icon + delta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: c.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon style={{ width: 18, height: 18, color: c.icon }} />
        </div>
        {delta && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 9999,
              background: delta.positive ? "#dcfce7" : "#fee2e2",
              color: delta.positive ? "#15803d" : "#dc2626",
            }}
          >
            {delta.positive ? (
              <TrendingUp style={{ width: 11, height: 11 }} />
            ) : (
              <TrendingDown style={{ width: 11, height: 11 }} />
            )}
            {delta.value}
          </div>
        )}
      </div>

      {/* Row 2: value */}
      <div style={{ fontSize: 18, fontWeight: 800, color: c.val, lineHeight: 1, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>

      {/* Row 3: label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#64748b",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>

      {/* Row 4: subtitle */}
      {subtitle && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}
