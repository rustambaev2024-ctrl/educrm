import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StickyActionBarProps {
  /** Слева: что происходит. Обычно счётчик или статус несохранённого. */
  status?: ReactNode;
  /** Справа: действия. Главное — последним, оно ближе к большому пальцу. */
  children: ReactNode;
  className?: string;
}

/**
 * Панель действия, закреплённая внизу экрана.
 *
 * Решает конкретную проблему: на длинных экранах кнопка сохранения стояла
 * в шапке. Учитель на телефоне прокручивал список из двадцати учеников,
 * отмечал — и должен был вернуться наверх, чтобы сохранить. Панель внизу
 * держит действие под большим пальцем всё время.
 *
 * Встаёт НАД нижней навигацией: её высоту каркас отдаёт в --app-bottom-nav.
 * Без этого кнопка пряталась бы под панелью вкладок.
 */
export function StickyActionBar({ status, children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-20 border-t border-border bg-card/95 backdrop-blur",
        "lg:left-64",
        className,
      )}
      style={{
        bottom: "calc(var(--app-bottom-nav, 0rem) + env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        {status ? <div className="min-w-0 flex-1 text-sm text-muted-foreground">{status}</div> : null}
        <div className={cn("flex items-center gap-2", !status && "ml-auto")}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Отступ снизу под липкую панель, чтобы последняя строка списка не пряталась
 * под ней. Ставится на контейнер содержимого страницы.
 */
export const STICKY_BAR_SPACER = "pb-20";
