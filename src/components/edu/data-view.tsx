import { ChevronRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  /** Ключ для React и для подписи значения в карточке. */
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * Не показывать в карточке на телефоне. Ставится тем колонкам, чьё
   * содержимое уже вынесено в заголовок, подпись или значение карточки, —
   * иначе имя ученика покажется дважды.
   */
  hideOnCard?: boolean;
  align?: "left" | "right";
  /** Ширина/классы ячейки в таблице. */
  className?: string;
}

export interface DataViewProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;

  /** Заголовок карточки — то, что должно прочитаться первым. Обычно имя. */
  cardTitle: (row: T) => ReactNode;
  /** Вторая строка карточки: группа, курс, дата. */
  cardSubtitle?: (row: T) => ReactNode;
  /** Крупное значение справа: сумма, статус, балл. */
  cardValue?: (row: T) => ReactNode;

  onRowClick?: (row: T) => void;
  /** Кнопки в конце строки и в углу карточки. */
  actions?: (row: T) => ReactNode;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /**
   * Пустое состояние. Форма `action` повторяет контракт EmptyState
   * (подпись + обработчик), а не свободную разметку: столп 4 требует
   * у пустого экрана понятного действия, а не произвольного содержимого.
   */
  empty?: {
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };
  className?: string;
}

/**
 * Список данных: таблица на широком экране, карточки на телефоне.
 *
 * Заменяет одиннадцать рукописных таблиц. До этого узкий экран обслуживал
 * общий CSS-приём (`edu-cards`): он переворачивал строку вслепую — первая
 * ячейка становилась заголовком, остальные шли подряд. Это спасало от
 * горизонтальной прокрутки, но не делало карточку осмысленной: сумма,
 * статус и имя весили одинаково.
 *
 * Здесь карточку собирает вызывающий: он говорит, что заголовок, что
 * подпись и что главное значение. Иерархия появляется потому, что её
 * задали, а не потому, что так легли ячейки.
 */
export function DataView<T>({
  rows,
  columns,
  rowKey,
  cardTitle,
  cardSubtitle,
  cardValue,
  onRowClick,
  actions,
  loading,
  error,
  onRetry,
  empty,
  className,
}: DataViewProps<T>) {
  if (error) {
    return (
      <ErrorState
        title={error}
        onRetry={onRetry}
        description={
          onRetry ? undefined : "Ma'lumot yuklanmadi / Данные не загрузились"
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-2" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-6" />}
        title={empty?.title ?? "Ma'lumot yo'q / Пока пусто"}
        description={empty?.description}
        action={empty?.action}
      />
    );
  }

  const cardColumns = columns.filter((column) => !column.hideOnCard);
  const interactive = Boolean(onRowClick);

  return (
    <div className={className}>
      {/* ══ Таблица — от 768px ══ */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.align === "right" && "text-right", column.className)}
                >
                  {column.header}
                </TableHead>
              ))}
              {actions ? <TableHead className="w-px" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                className={cn(interactive && "cursor-pointer")}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.align === "right" && "text-right", column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
                {actions ? (
                  // Клик по действию не должен открывать строку целиком.
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ══ Карточки — до 768px ══ */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const Wrapper = interactive ? "button" : "div";
          return (
            <Wrapper
              key={rowKey(row)}
              {...(interactive
                ? { type: "button" as const, onClick: () => onRowClick?.(row) }
                : {})}
              className={cn(
                "flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left",
                interactive && "edu-row",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {cardTitle(row)}
                  </div>
                  {cardSubtitle ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {cardSubtitle(row)}
                    </div>
                  ) : null}
                </div>

                {cardValue ? (
                  <div className="shrink-0 text-right text-sm font-semibold">
                    {cardValue(row)}
                  </div>
                ) : null}

                {interactive && !cardValue ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : null}
              </div>

              {cardColumns.length > 0 ? (
                <dl className="flex flex-wrap gap-x-4 gap-y-1">
                  {cardColumns.map((column) => (
                    <div key={column.key} className="flex min-w-0 items-baseline gap-1.5">
                      <dt className="shrink-0 text-[11px] text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 truncate text-xs text-foreground">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {actions ? (
                <div
                  className="flex justify-end gap-1"
                  // Внутри карточки-кнопки действия обязаны глушить всплытие,
                  // иначе тап по «удалить» ещё и откроет саму строку.
                  onClick={(e) => e.stopPropagation()}
                >
                  {actions(row)}
                </div>
              ) : null}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
