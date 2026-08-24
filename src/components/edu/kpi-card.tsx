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

/**
 * Цвет иконки — категориальная метка, а не оценка.
 *
 * Ряды берутся из палитры графиков: она для того и существует, чтобы
 * соседние категории различались между собой и оставались читаемыми.
 * Раньше здесь стояли прямые цвета палитры Tailwind — они не меняются
 * вместе с палитрой продукта и ничего не значат.
 *
 * Имена вариантов остались прежними («blue», «violet»), хотя и описывают
 * цвет, а не смысл: их передают десятки экранов. Переименование — отдельная
 * работа, здесь важнее было убрать хардкод.
 */
const TONE: Record<string, string> = {
  blue: "var(--chart-2)",
  green: "var(--chart-1)",
  amber: "var(--chart-3)",
  red: "var(--chart-4)",
  violet: "var(--chart-5)",
  cyan: "var(--chart-6)",
};

const legacyMap: Record<string, keyof typeof TONE> = {
  indigo: "blue",
  blue: "blue",
  green: "green",
  red: "red",
  amber: "amber",
  violet: "violet",
  cyan: "cyan",
};

export function KpiCard({ label, value, subtitle, delta, icon: Icon, color, iconColor }: KpiCardProps) {
  const key = color ?? (iconColor ? legacyMap[iconColor] : undefined) ?? "blue";
  const tone = TONE[key] ?? TONE.blue;

  return (
    <div className="min-w-0 overflow-hidden rounded-[10px] border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div
          className="flex size-9 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${tone} 12%, transparent)`,
            color: tone,
          }}
        >
          <Icon className="size-[18px]" />
        </div>
        {delta && (
          // Изменение — единственное место, где цвет здесь оценивает.
          // Рост не красим в зелёный: зелёный в продукте занят действием,
          // и рядом со ссылкой он читался бы как «нажми меня».
          <div
            className={`flex items-center gap-[3px] rounded-full px-[7px] py-0.5 text-[11px] font-semibold ${
              delta.positive ? "bg-muted text-foreground" : "bg-bad-soft text-bad"
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

      {/* Значение не окрашивается: норма цвета не требует. Исключение —
          «красный» вариант, которым помечают то, что требует внимания. */}
      <div
        className={`mb-1 truncate text-xl font-extrabold leading-none tabular-nums ${
          key === "red" ? "text-bad" : "text-foreground"
        }`}
      >
        {value}
      </div>

      <div className="truncate text-[11px] font-semibold leading-snug text-muted-foreground">
        {label}
      </div>

      {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
