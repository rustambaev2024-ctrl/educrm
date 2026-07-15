import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

/** Строка списка людей: аватар + имя/подпись + бейдж статуса. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 p-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48 max-w-[60%]" />
        <Skeleton className="h-3 w-32 max-w-[40%]" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  );
}

/** Несколько строк списка подряд. */
function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Карточка группы/курса. */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Skeleton className="h-5 w-40 max-w-[70%]" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

/** Сетка карточек. */
function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Плитка статистики на дашборде. */
function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32 max-w-[70%]" />
    </div>
  );
}

function PageLoadingState({ cards = 4 }: { cards?: number }) {
  return (
    <div className="flex min-h-[320px] flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56 max-w-[70%]" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export {
  Skeleton,
  RowSkeleton,
  ListSkeleton,
  CardSkeleton,
  CardGridSkeleton,
  StatCardSkeleton,
  PageLoadingState,
};
