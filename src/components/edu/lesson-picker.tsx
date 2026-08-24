import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PickableLesson {
  id: string;
  /** «10:00» */
  time: string;
  /** Название группы. */
  title: string;
  /** Журнал за этот урок уже отмечен. */
  done?: boolean;
}

export interface LessonPickerProps {
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /** Как показать дату пользователю. */
  formatDate: (date: string) => string;
  todayKey: string;
  todayLabel: string;

  lessons: PickableLesson[];
  selectedLessonId: string;
  onSelectLesson: (id: string) => void;

  prevLabel: string;
  nextLabel: string;
}

/**
 * Выбор дня и урока — полосой, а не двумя выпадающими списками.
 *
 * Раньше учитель, чтобы вообще что-то увидеть, должен был открыть список
 * дат, выбрать, открыть список уроков, выбрать. Два скрытых меню ДО того,
 * как на экране появился хоть один ученик — при том что в подавляющем
 * большинстве случаев нужен урок, который идёт прямо сейчас.
 *
 * Теперь: нужный день и урок выбраны заранее, всё видно сразу, а переход
 * к соседнему — одно касание по видимой цели. Стрелки по дням нужны редко,
 * поэтому они компактные; уроки дня — крупные, потому что между ними
 * переключаются часто.
 */
export function LessonPicker({
  dates,
  selectedDate,
  onSelectDate,
  formatDate,
  todayKey,
  todayLabel,
  lessons,
  selectedLessonId,
  onSelectLesson,
  prevLabel,
  nextLabel,
}: LessonPickerProps) {
  // dates отсортированы от новых к старым, поэтому «раньше» — это вперёд по массиву.
  const index = dates.indexOf(selectedDate);
  const olderDate = index >= 0 && index < dates.length - 1 ? dates[index + 1] : null;
  const newerDate = index > 0 ? dates[index - 1] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          disabled={!olderDate}
          onClick={() => olderDate && onSelectDate(olderDate)}
          aria-label={prevLabel}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold">{formatDate(selectedDate)}</div>
          {selectedDate === todayKey && (
            <div className="text-[11px] font-medium text-primary">{todayLabel}</div>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          disabled={!newerDate}
          onClick={() => newerDate && onSelectDate(newerDate)}
          aria-label={nextLabel}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Уроки дня. Прокрутка вбок, а не сжатие: подписи групп длинные,
          а flex-1 на них ломает вёрстку — этот класс багов в проекте
          уже дважды доезжал до прода. */}
      {lessons.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-max gap-2">
            {lessons.map((lesson) => {
              const active = lesson.id === selectedLessonId;
              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson.id)}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 shrink-0 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-bold tabular-nums">{lesson.time}</span>
                  <span
                    className={cn(
                      "max-w-40 truncate text-[11px]",
                      active ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {lesson.title}
                    {/* Точка — «журнал уже отмечен». Не цветом одним:
                        рядом стоит символ, чтобы читалось и без различения цвета. */}
                    {lesson.done ? " ✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
