import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonPicker } from "@/components/edu/lesson-picker";
import { StickyActionBar, STICKY_BAR_SPACER } from "@/components/edu/sticky-action-bar";
import {
  AttendanceBoard,
  ATTENDANCE_STATUS_META,
  type BoardStudent,
} from "@/components/edu/attendance-board";
import type { AttendanceStatus } from "@/lib/data/types";

export const Route = createFileRoute("/preview")({ component: PreviewPage });

/**
 * Витрина новых экранов.
 *
 * Существует ради одной задачи: владелец должен увидеть и потрогать
 * переработанный интерфейс, не заводя учётную запись и не трогая боевые
 * данные. Здесь работают ТЕ ЖЕ компоненты, что и в продукте, — на образцах
 * данных. Что утверждено здесь, то и уходит в работу; расхождения между
 * «показали» и «сделали» быть не может по построению.
 *
 * Страница публичная и намеренно не связана с меню: её открывают по прямой
 * ссылке. Данных из системы здесь нет.
 */

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Был",
  late: "Опоздал",
  excused: "Уваж.",
  absent: "Не был",
};

const SAMPLE_STUDENTS: BoardStudent[] = [
  { id: "1", fullName: "Каримова Амина", phone: "+998 90 123-45-67" },
  { id: "2", fullName: "Абдуллаев Мухаммадали", phone: "+998 91 234-56-78", charged: true },
  { id: "3", fullName: "Юсупова Севинч", phone: "+998 93 345-67-89" },
  { id: "4", fullName: "Рахматова Шарқия", phone: "+998 94 456-78-90" },
  { id: "5", fullName: "Отажонов Умрбек", phone: "+998 97 567-89-01" },
  { id: "6", fullName: "Исмоилова Гуласал", phone: "+998 99 678-90-12" },
  { id: "7", fullName: "Шоназаров Алишер", phone: "+998 90 789-01-23" },
];

const SAMPLE_DATES = ["2026-08-18", "2026-08-16", "2026-08-14"];

const SAMPLE_LESSONS = [
  { id: "l1", time: "09:00", title: "Английский · A1", done: true },
  { id: "l2", time: "10:30", title: "Английский · B2", done: false },
  { id: "l3", time: "14:00", title: "Математика · C1", done: false },
];

function PreviewPage() {
  const [date, setDate] = useState(SAMPLE_DATES[0]);
  const [lessonId, setLessonId] = useState("l2");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const lesson = SAMPLE_LESSONS.find((l) => l.id === lessonId) ?? SAMPLE_LESSONS[1];
  const markedCount = SAMPLE_STUDENTS.filter((s) => marks[s.id]).length;
  const hasChanges = markedCount > 0;

  return (
    <div className="min-h-dvh bg-background text-foreground [--app-bottom-nav:0rem]">
      <header className="sticky top-0 z-30 border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Отметка посещаемости</div>
            <div className="text-[11px] text-muted-foreground">
              Витрина нового интерфейса · образцы данных
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            Черновик
          </span>
        </div>
      </header>

      <main className={`mx-auto max-w-5xl px-4 py-4 ${STICKY_BAR_SPACER}`}>
        <div className="mb-4 rounded-xl border border-border bg-card p-3 text-[13px] leading-relaxed text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Что изменилось на этом экране</p>
          <p className="mb-1">
            <span className="font-medium text-foreground">Было:</span> два выпадающих списка —
            выбрать дату, выбрать урок — и только потом появлялись ученики. Кнопка
            «Сохранить» стояла вверху: отметив двадцатого ученика, надо было
            прокрутить весь список обратно.
          </p>
          <p>
            <span className="font-medium text-foreground">Стало:</span> нужный урок открыт
            сразу — тот, что идёт сейчас. Соседние уроки дня — видимой полосой в одно
            касание. «Отметить всех пришедшими» одной кнопкой, дальше правишь
            исключения. Сохранение всегда под большим пальцем.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <LessonPicker
            dates={SAMPLE_DATES}
            selectedDate={date}
            onSelectDate={setDate}
            formatDate={(d) =>
              new Date(`${d}T00:00:00`).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "long",
                weekday: "short",
              })
            }
            todayKey={SAMPLE_DATES[0]}
            todayLabel="сегодня"
            lessons={SAMPLE_LESSONS}
            selectedLessonId={lessonId}
            onSelectLesson={setLessonId}
            prevLabel="Предыдущий день"
            nextLabel="Следующий день"
          />

          <AttendanceBoard
            groupName={lesson.title}
            time={lesson.time}
            roomName="Каб. 108"
            recordedNote="Журнал ещё не отмечен"
            students={SAMPLE_STUDENTS}
            marks={marks}
            onSetStatus={(id, status) => setMarks((prev) => ({ ...prev, [id]: status }))}
            onMarkAllPresent={() =>
              setMarks(Object.fromEntries(SAMPLE_STUDENTS.map((s) => [s.id, "present" as const])))
            }
            labels={{
              statusName: (status) => STATUS_LABEL[status],
              markAllPresent: "Отметить всех пришедшими",
              chargedNote: "списано",
              emptyRoster: "В группе нет активных учеников",
            }}
          />
        </div>
      </main>

      <StickyActionBar
        status={
          <span className="tabular-nums">
            Отмечено: {markedCount}/{SAMPLE_STUDENTS.length}
            {hasChanges && <span className="ml-2 text-warn">· не сохранено</span>}
          </span>
        }
      >
        <Button className="gap-2" disabled={!hasChanges}>
          <Save className="size-4" />
          Сохранить
        </Button>
      </StickyActionBar>
    </div>
  );
}

/** Ключи статусов используются доской — держим импорт живым для типов. */
void ATTENDANCE_STATUS_META;
