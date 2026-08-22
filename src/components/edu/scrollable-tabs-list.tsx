import type { ReactNode } from "react";
import { TabsList } from "@/components/ui/tabs";

/** Полный набор `grid-cols-N`, которые реально встречаются в разметке ниже —
 *  класс должен быть литералом в исходнике, иначе Tailwind его не соберёт. */
const COLUMN_CLASSES: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/**
 * `TabsList`, обёрнутый в горизонтальную прокрутку на узких экранах.
 *
 * `whitespace-nowrap` на `TabsTrigger` + `grid-cols-N` = текст вылезает за
 * ячейку на узких экранах. Прокрутка вбок вместо переноса/обрезки.
 *
 * `columns` — число `TabsTrigger`-детей (равно значению grid-cols на десктопе,
 * где сетка становится `w-full`); задаётся явно, а не через
 * `React.Children.count`, чтобы число колонок было видно на месте вызова.
 */
export function ScrollableTabsList({ columns, children }: { columns: number; children: ReactNode }) {
  const colsClass = COLUMN_CLASSES[columns] ?? "grid-cols-4";
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <TabsList className={`grid w-max min-w-full ${colsClass} sm:w-full`}>{children}</TabsList>
    </div>
  );
}
