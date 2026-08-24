import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Что не получилось — с точки зрения пользователя, не системы. */
  title: string;
  /** Почему и что делать. Если причина известна — назвать её. */
  description?: string;
  /** Повторить попытку. Без этого экран становится тупиком. */
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  className?: string;
}

/**
 * Парный компонент к EmptyState. Различие принципиальное: пустой список —
 * это факт («учеников пока нет»), а ошибка — это неизвестность («список
 * не загрузился»). Без отдельного состояния пользователь видит одно и то же
 * пустое место в обоих случаях и не знает, ждать ему или действовать.
 *
 * Формулировки: не извиняемся и не пишем «Xatolik». Говорим, что именно
 * не получилось и что можно сделать.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Qayta urinish / Повторить",
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} disabled={isRetrying} className="mt-1 gap-2">
          <RotateCw className={cn("size-4", isRetrying && "animate-spin")} />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
