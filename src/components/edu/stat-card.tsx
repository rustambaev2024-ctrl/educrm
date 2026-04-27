import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
}

const TONE_BG: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-accent text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatCard({ label, value, delta, hint, icon: Icon, tone = "primary" }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="gap-0 p-5 shadow-elegant transition-shadow hover:shadow-elegant-lg">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-3xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={`flex size-10 items-center justify-center rounded-xl ${TONE_BG[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
      {(delta !== undefined || hint) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {delta !== undefined && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${
              positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            }`}>
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {positive ? "+" : ""}{delta}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </Card>
  );
}
