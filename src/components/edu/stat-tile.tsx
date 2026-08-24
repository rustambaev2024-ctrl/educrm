import type { ElementType } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

/**
 * Компактная плитка «иконка + значение + подпись» для мобильных
 * student/parent-порталов. Раньше было три локальные копии
 * (`QuickCard` в student/index.tsx, `Stat` в student/profile.tsx,
 * `Mini` в parent/children.tsx) с одинаковой идеей, но разной вёрсткой.
 *
 * Не переиспользует `KpiCard` (src/components/edu/kpi-card.tsx): тот
 * рассчитан на самостоятельные KPI-карточки учителя/админа/директора —
 * своя рамка/тень, delta-бейдж, цвет иконки категориальный (палитра
 * графиков). Здесь два реально разных случая:
 *
 * - `variant="card"` (был `QuickCard`) — тоже своя карточка с цветным
 *   блоком иконки, но компактнее KpiCard, и цвет здесь ОСМЫСЛЕННЫЙ
 *   (success/warning), а не категориальный — обратное тому, что
 *   документировано в KpiCard. Подмешивать эту семантику в KpiCard
 *   означало бы завести вторую систему цвета внутри одного компонента.
 * - `variant="bare"` (были `Stat` и `Mini`) — вообще без своей рамки:
 *   ячейка внутри чужой сетки с divide-x/divide-y (шапка профиля).
 *   Обёртка KpiCard в карточку внутри карточки была бы визуальным
 *   регрессом.
 */
interface StatTileProps {
  icon: ElementType;
  value: string;
  label: string;
  variant?: "card" | "bare";
  /** Только variant="card": оборачивает плитку в Link (был обязательным `to` у QuickCard). */
  to?: string;
  /** Только variant="card": смысловой цвет блока иконки (было `tone` у QuickCard). */
  tone?: "primary" | "success" | "warning" | "info";
  /** Только variant="card": строка под значением (было `hint` у QuickCard). */
  hint?: string;
  /** Только variant="bare": переопределение цвета значения (был `valueClass` у Mini). */
  valueClass?: string;
  /**
   * Только variant="bare": вторая, более плотная плотность — у `Mini`
   * (parent/children.tsx, до 4 плиток в ряд) размеры были меньше, чем
   * у `Stat` (student/profile.tsx, 3 плитки в ряд). Сохраняем разницу,
   * а не унифицируем размер, чтобы не менять вёрстку обеих страниц.
   */
  size?: "md" | "sm";
}

const CARD_TONES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  primary: "bg-accent text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
};

export function StatTile({
  icon: Icon,
  value,
  label,
  variant = "card",
  to,
  tone = "primary",
  hint,
  valueClass,
  size = "md",
}: StatTileProps) {
  if (variant === "bare") {
    const iconSize = size === "sm" ? "size-3.5" : "size-4";
    const valueSize = size === "sm" ? "text-base" : "text-lg";
    const labelSize = size === "sm" ? "text-[9px]" : "text-[10px]";
    return (
      <div className={`flex flex-col items-center gap-1 p-3 ${size === "md" ? "text-center" : ""}`}>
        <Icon className={`${iconSize} text-muted-foreground`} />
        <div className={`${valueSize} font-bold leading-none ${valueClass ?? ""}`}>{value}</div>
        <div className={`${labelSize} uppercase tracking-wider text-muted-foreground`}>{label}</div>
      </div>
    );
  }

  const content = (
    <Card className="gap-2 p-4 shadow-elegant transition-all active:scale-95">
      <div className={`flex size-9 items-center justify-center rounded-xl ${CARD_TONES[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </Card>
  );

  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
