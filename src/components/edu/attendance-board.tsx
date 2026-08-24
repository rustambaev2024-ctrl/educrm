import { Check, Clock, FileText, MapPin, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import type { AttendanceStatus } from "@/lib/data/types";

/**
 * Отметки посещаемости.
 *
 * Цвета здесь были фантомными: `bg-success`, `text-warning-foreground`
 * и подобные не объявлены ни в одном наборе токенов, поэтому Tailwind
 * их просто не выпускал — проверено по собранному CSS, ноль правил.
 * Самый нажимаемый элемент учителя был бесцветным: «был» и «не был»
 * отличались только иконкой.
 *
 * Теперь смысловые токены: пришёл — подтверждение, опоздал — внимание,
 * уважительная — информация (за неё не списывают деньги, это не провинность),
 * не пришёл — потеря.
 */
export const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = ["present", "late", "excused", "absent"];

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { icon: typeof Check; tone: string; activeTone: string; key: string }
> = {
  present: {
    icon: Check,
    tone: "border-border text-muted-foreground hover:bg-ok-soft hover:text-ok",
    activeTone: "border-ok bg-ok text-ok-foreground",
    key: "att.present",
  },
  late: {
    icon: Clock,
    tone: "border-border text-muted-foreground hover:bg-warn-soft hover:text-warn",
    activeTone: "border-warn bg-warn text-warn-foreground",
    key: "att.late",
  },
  excused: {
    icon: FileText,
    tone: "border-border text-muted-foreground hover:bg-info-soft hover:text-info",
    activeTone: "border-info bg-info text-info-foreground",
    key: "att.excused",
  },
  absent: {
    icon: X,
    tone: "border-border text-muted-foreground hover:bg-bad-soft hover:text-bad",
    activeTone: "border-bad bg-bad text-bad-foreground",
    key: "att.absent",
  },
};

export interface BoardStudent {
  id: string;
  fullName: string;
  phone: string;
  /** За этот урок деньги уже списаны. */
  charged?: boolean;
}

export interface AttendanceBoardProps {
  groupName: string;
  time: string;
  roomName: string;
  /** «Отметил Иванов · 18 авг 10:42» либо null, если журнал пуст. */
  recordedNote: string | null;

  students: BoardStudent[];
  marks: Record<string, AttendanceStatus>;
  onSetStatus: (studentId: string, status: AttendanceStatus) => void;
  onMarkAllPresent: () => void;

  loading?: boolean;
  /** Подписи — приходят снаружи, компонент не знает про язык. */
  labels: {
    statusName: (status: AttendanceStatus) => string;
    markAllPresent: string;
    chargedNote: string;
    emptyRoster: string;
  };
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Доска отметок: чем занятие, кто в нём и какие отметки стоят.
 *
 * Чистый компонент без обращений к серверу — поэтому его можно показать
 * на витрине без входа в систему, и то, что владелец там утверждает,
 * буквально то же самое, что работает в продукте.
 */
export function AttendanceBoard({
  groupName,
  time,
  roomName,
  recordedNote,
  students,
  marks,
  onSetStatus,
  onMarkAllPresent,
  loading,
  labels,
}: AttendanceBoardProps) {
  const nothingMarked = students.every((s) => !marks[s.id]);

  return (
    <div className="flex flex-col gap-4">
      {/* ══ Что отмечаем ══
          Урок назван крупно и первым: раньше это была мелкая подпись под
          двумя выпадающими списками, и учитель не был уверен, в тот ли
          журнал он ставит отметки. */}
      <div className="rounded-xl bg-sidebar p-4 text-sidebar-foreground">
        <div className="text-base font-semibold">{groupName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-sidebar-foreground/70">
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {time}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> {roomName}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {students.length}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-sidebar-foreground/60">{recordedNote}</div>
      </div>

      {/* ══ Быстрый путь ══
          В обычном занятии пришли почти все. Кнопка была маленькой и стояла
          в шапке рядом с «Сохранить»; теперь это главное действие, пока не
          отмечен никто: одно касание — и остаётся поправить двоих. */}
      {nothingMarked && students.length > 0 && !loading && (
        <Button size="lg" className="w-full gap-2" onClick={onMarkAllPresent}>
          <Check className="size-4" />
          {labels.markAllPresent}
        </Button>
      )}

      {loading ? (
        <Card className="p-4">
          <ListSkeleton rows={6} />
        </Card>
      ) : students.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={labels.emptyRoster} />
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((student) => {
            const current = marks[student.id];
            return (
              <div
                key={student.id}
                // Пунктирная рамка у неотмеченных: видно, кого ещё не тронули,
                // не вчитываясь в кнопки.
                className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:gap-3 ${
                  current ? "border-border bg-card" : "border-dashed border-border"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {initialsOf(student.fullName)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{student.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {student.phone}
                      {student.charged && <span className="ml-1.5">· {labels.chargedNote}</span>}
                    </div>
                  </div>
                </div>

                {/* Четыре статуса — четыре колонки. Стояло grid-cols-5 при
                    четырёх кнопках: пятая колонка была пустой, а кнопки
                    сжаты в четыре пятых ширины. */}
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-1.5">
                  {ATTENDANCE_STATUS_ORDER.map((status) => {
                    const meta = ATTENDANCE_STATUS_META[status];
                    const Icon = meta.icon;
                    const active = current === status;
                    const name = labels.statusName(status);
                    return (
                      <button
                        key={status}
                        onClick={() => onSetStatus(student.id, status)}
                        aria-pressed={active}
                        aria-label={name}
                        title={name}
                        className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors sm:min-h-9 sm:px-2.5 sm:text-[11px] ${
                          active ? meta.activeTone : meta.tone
                        }`}
                      >
                        <Icon className="size-4 sm:size-3.5" />
                        <span className="hidden sm:inline">{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
