import type { ElementType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: string; positive: boolean };
  icon: ElementType;
  iconColor?: "indigo" | "green" | "red" | "amber" | "blue" | "violet";
}

const iconColors = {
  indigo: { bg: "bg-[#EEF2FF]", text: "text-[#4F46E5]" },
  green: { bg: "bg-[#F0FDF4]", text: "text-[#16A34A]" },
  red: { bg: "bg-[#FEF2F2]", text: "text-[#DC2626]" },
  amber: { bg: "bg-[#FFFBEB]", text: "text-[#B45309]" },
  blue: { bg: "bg-[#EFF6FF]", text: "text-[#1D4ED8]" },
  violet: { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]" },
};

export function KpiCard({
  label,
  value,
  subtitle,
  delta,
  icon: Icon,
  iconColor = "indigo",
}: KpiCardProps) {
  const colors = iconColors[iconColor];

  return (
    <div className="rounded-xl border border-border/50 bg-white p-4 dark:bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", colors.bg)}>
        <Icon className={cn("h-[18px] w-[18px]", colors.text)} />
      </div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[22px] font-semibold leading-none text-foreground">{value}</div>
      {subtitle && <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>}
      {delta && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 text-[11px] font-medium",
            delta.positive ? "text-[#16A34A]" : "text-[#DC2626]",
          )}
        >
          {delta.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta.value}
        </div>
      )}
    </div>
  );
}
