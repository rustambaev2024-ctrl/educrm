import type { ReactNode } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Не подменять содержимое состоянием ошибки, даже если общая загрузка
   * упала. Для экранов, которые тянут данные сами и не зависят от стора.
   */
  ignoreLoadError?: boolean;
}

/**
 * Обёртка страницы: заголовок, действия, состояние ошибки.
 *
 * Стоит на 45 экранах, поэтому собран на токенах и утилитах, а не на
 * инлайн-стилях: инлайн не переключается вместе с палитрой и не знает
 * про плотность роли.
 *
 * Заголовок на узком экране переносится, а не обрезается. Раньше здесь
 * стояло nowrap + многоточие, и «Посещаемость группы B2» на телефоне
 * превращалась в «Посещаемость гру…» — при том что места под вторую
 * строку было сколько угодно.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
  ignoreLoadError = false,
}: PageShellProps) {
  const { loadError, reload, isLoading } = useData();
  const { lang } = useI18n();

  // Стор отдавал loadError и reload, но их не читал ни один экран: когда
  // общая загрузка падала, все страницы показывали пустые списки, как будто
  // данных просто нет. Пользователь не мог отличить «учеников нет» от
  // «список не загрузился». PageShell стоит на 45 экранах, поэтому одно
  // место закрывает их все.
  const showError = !ignoreLoadError && Boolean(loadError);

  return (
    <div className="w-full min-w-0 p-4">
      <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && !showError && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <div className="mb-3.5 h-px bg-border" />

      {showError ? (
        <ErrorState
          title={lang === "uz" ? "Ma'lumotlar yuklanmadi" : "Данные не загрузились"}
          description={
            lang === "uz"
              ? "Sahifa bo'sh ko'rinishi mumkin, lekin bu ma'lumot yo'qligini bildirmaydi. Aloqani tekshirib, qayta urinib ko'ring."
              : "Страница может выглядеть пустой, но это не значит, что данных нет. Проверьте связь и повторите."
          }
          onRetry={() => void reload()}
          isRetrying={isLoading}
          retryLabel={lang === "uz" ? "Qayta urinish" : "Повторить"}
        />
      ) : (
        children
      )}
    </div>
  );
}
