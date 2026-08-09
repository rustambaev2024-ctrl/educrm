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
    <div style={{ padding: 16, boxSizing: "border-box", width: "100%", overflowX: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 14,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2, marginBottom: 0 }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && !showError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              flexShrink: 0,
              maxWidth: "55%",
            }}
          >
            {actions}
          </div>
        )}
      </div>
      <div style={{ height: 1, background: "var(--border-light)", marginBottom: 14 }} />

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
