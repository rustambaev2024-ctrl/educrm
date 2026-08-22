import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { LessonPicker, type PickableLesson } from "@/components/edu/lesson-picker";
import { AttendanceBoard, ATTENDANCE_STATUS_META } from "@/components/edu/attendance-board";
import { StickyActionBar, STICKY_BAR_SPACER } from "@/components/edu/sticky-action-bar";
import { groupApi, attendanceApi, ApiError } from "@/lib/api";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTime, getLocalDateString } from "@/lib/format";
import { mapStudents, toResults, type StudentRaw } from "@/lib/data/mappers";
import type { AttendanceStatus, Student } from "@/lib/data/types";

export const Route = createFileRoute("/support-teacher/attendance")({ component: AttendancePage });

function AttendancePage() {
  const { t, lang } = useI18n();
  const { groups, lessons, rooms, students, staff, getAttendanceFor, setAttendance, isLoading } = useData();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  // Группы из store уже отфильтрованы бэкендом по учителям этого помощника —
  // помощник может быть закреплён за несколькими учителями, поэтому
  // клиентского фильтра по teacherId здесь, в отличие от teacher/attendance,
  // нет и не нужно.
  const myGroupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

  const allMyLessons = useMemo(
    () =>
      lessons
        // Отменённые уроки нельзя отмечать (бэкенд их отклоняет) — убираем из выбора.
        .filter((l) => myGroupIds.has(l.groupId) && l.status !== "cancelled"),
    [lessons, myGroupIds],
  );

  // Локальная дата (не UTC — иначе сдвиг на -5 часов).
  const toDateKey = (value: string) => getLocalDateString(new Date(value));
  const todayKey = getLocalDateString();

  const availableDates = useMemo(() => {
    const keys = new Set(allMyLessons.map((l) => toDateKey(l.datetime)));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [allMyLessons]);

  const [selectedDate, setSelectedDate] = useState<string>("");

  // По умолчанию — сегодня; если сегодня уроков нет — ближайший прошедший
  // день с уроками (или ближайший будущий, если прошедших нет).
  useEffect(() => {
    if (selectedDate || availableDates.length === 0) return;
    if (availableDates.includes(todayKey)) {
      setSelectedDate(todayKey);
      return;
    }
    const past = availableDates.find((d) => d < todayKey);
    setSelectedDate(past ?? availableDates[availableDates.length - 1]);
  }, [availableDates, selectedDate, todayKey]);

  const myLessons = useMemo(
    () =>
      allMyLessons
        .filter((l) => toDateKey(l.datetime) === selectedDate)
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
    [allMyLessons, selectedDate],
  );

  const [selectedLessonId, setSelectedLessonId] = useState<string>("");

  /**
   * Урок по умолчанию — идущий сейчас или ближайший следующий.
   *
   * Раньше брался просто первый урок дня с учениками. Помощник учителя,
   * открывший экран в середине дня, попадал на утреннее занятие и
   * переключался руками. Теперь: если день сегодняшний — тот урок, который
   * идёт или вот-вот начнётся; если день прошедший — последний, за него и
   * отмечают задним числом.
   */
  useEffect(() => {
    if (myLessons.length === 0) return;
    if (myLessons.some((l) => l.id === selectedLessonId)) return;

    const now = Date.now();
    const upcoming = myLessons.find((l) => {
      const start = new Date(l.datetime).getTime();
      // Урок «текущий» ещё полтора часа после начала — занятие идёт,
      // а журнал обычно отмечают по ходу или в конце.
      return start + 90 * 60 * 1000 >= now;
    });
    const fallback = selectedDate < todayKey ? myLessons[myLessons.length - 1] : myLessons[0];
    setSelectedLessonId((upcoming ?? fallback).id);
  }, [myLessons, selectedLessonId, selectedDate, todayKey]);

  const lesson = myLessons.find((l) => l.id === selectedLessonId);
  const group = lesson ? groups.find((g) => g.id === lesson.groupId) : undefined;
  const room = lesson ? rooms.find((r) => r.id === lesson.roomId) : undefined;

  const [lessonStudents, setLessonStudents] = useState<Student[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  useEffect(() => {
    if (!group?.id) {
      setLessonStudents([]);
      return;
    }

    let cancelled = false;
    setIsRosterLoading(true);
    void groupApi
      .students(group.id)
      .then((raw) => {
        if (cancelled) return;
        setLessonStudents(mapStudents(toResults(raw as { results: StudentRaw[] } | StudentRaw[])) as Student[]);
      })
      .catch((error) => {
        console.warn("[attendance] failed to load group roster:", error);
        if (!cancelled) setLessonStudents([]);
      })
      .finally(() => {
        if (!cancelled) setIsRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [group?.id]);

  const groupStudents = useMemo(() => {
    if (!group) return [];
    if (lessonStudents.length > 0) return lessonStudents;

    const studentsById = new Map(students.map((student) => [student.id, student]));
    return group.studentIds
      .map((studentId) => studentsById.get(studentId))
      .filter((student): student is Student => Boolean(student));
  }, [group, lessonStudents, students]);

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const savedRecords = useMemo(
    () => (lesson ? getAttendanceFor(lesson.id) : []),
    [lesson, getAttendanceFor],
  );

  useEffect(() => {
    if (!lesson) return;
    setMarks(
      savedRecords.length > 0
        ? Object.fromEntries(savedRecords.map((r) => [r.studentId, r.status]))
        : {},
    );
  }, [lesson, savedRecords]);

  // Кто и когда отметил журнал. Бэкенд пишет recorded_by/recorded_at по каждой
  // отметке, но до этого они не доходили до интерфейса — и на вопрос «журнал
  // забыли или его вёл кто-то другой» ответить по экрану было нельзя.
  const recordedBy = useMemo(() => {
    const withAuthor = savedRecords.find((r) => r.recordedAt);
    if (!withAuthor?.recordedAt) return null;
    const author = withAuthor.recordedByUserId
      ? staff.find((s) => s.userId === withAuthor.recordedByUserId)
      : undefined;
    return { at: withAuthor.recordedAt, name: author?.fullName };
  }, [savedRecords, staff]);

  const chargedStudentIds = useMemo(
    () => new Set(savedRecords.filter((r) => r.isCharged).map((r) => r.studentId)),
    [savedRecords],
  );

  /** Уроки дня для полосы выбора — с пометкой, где журнал уже отмечен. */
  const pickableLessons: PickableLesson[] = useMemo(
    () =>
      myLessons.map((l) => ({
        id: l.id,
        time: formatTime(l.datetime),
        title: groups.find((g) => g.id === l.groupId)?.name ?? "—",
        done: getAttendanceFor(l.id).length > 0,
      })),
    [myLessons, groups, getAttendanceFor],
  );

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    if (!groupStudents.length) return;
    setMarks(Object.fromEntries(groupStudents.map((s) => [s.id, "present" as const])));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!lesson) return;
    const records = groupStudents.map((s) => ({
      studentId: s.id,
      status: marks[s.id] ?? "absent",
    }));
    setIsSaving(true);
    try {
      await attendanceApi.bulkMark(
        lesson.id,
        records.map((r) => ({
          student_id: r.studentId,
          status: r.status,
        })),
      );
      setAttendance(lesson.id, records);
      toast.success(t("att.saved"));
    } catch (err) {
      console.error("[attendance] save failed:", err);
      const fallback = lang === "uz" ? "Davomatni saqlashda xatolik" : "Ошибка сохранения посещаемости";
      let message = fallback;
      if (err instanceof ApiError) {
        const detail = err.body?.detail;
        if (typeof detail === "string") {
          message = detail;
        } else if (detail && typeof detail === "object") {
          const d = detail as Record<string, string>;
          message = d[lang] ?? d.ru ?? fallback;
        }
      }
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const markedCount = groupStudents.filter((s) => marks[s.id]).length;
  const nothingMarked = markedCount === 0;
  /** Есть ли расхождение с тем, что уже сохранено. */
  const hasChanges = useMemo(() => {
    const saved = new Map(savedRecords.map((r) => [r.studentId, r.status]));
    if (saved.size === 0) return markedCount > 0;
    return groupStudents.some((s) => marks[s.id] !== saved.get(s.id));
  }, [groupStudents, marks, savedRecords, markedCount]);

  if (isLoading) {
    return (
      <PageShell title={t("att.title")} subtitle={t("att.subtitle")}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Card className="p-5">
            <ListSkeleton rows={6} />
          </Card>
        </div>
      </PageShell>
    );
  }

  if (allMyLessons.length === 0) {
    return (
      <PageShell title={t("att.title")} subtitle={t("att.subtitle")}>
        <EmptyState
          icon={<ClipboardCheck className="size-6" />}
          title={t("att.noLesson")}
          description={tr("Belgilanadigan darslar yo'q", "Нет уроков для отметки")}
        />
      </PageShell>
    );
  }

  return (
    <PageShell title={t("att.title")} subtitle={t("att.subtitle")}>
      <div className={`flex flex-col gap-4 ${STICKY_BAR_SPACER}`}>
        <LessonPicker
          dates={availableDates}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setSelectedLessonId("");
          }}
          formatDate={(d) => formatDate(`${d}T00:00:00`, lang)}
          todayKey={todayKey}
          todayLabel={tr("bugun", "сегодня")}
          lessons={pickableLessons}
          selectedLessonId={selectedLessonId}
          onSelectLesson={setSelectedLessonId}
          prevLabel={tr("Oldingi kun", "Предыдущий день")}
          nextLabel={tr("Keyingi kun", "Следующий день")}
        />

        {lesson && group && (
          <>
            <AttendanceBoard
              groupName={group.name}
              time={formatTime(lesson.datetime)}
              roomName={room?.name ?? "—"}
              recordedNote={
                recordedBy
                  ? `${tr("Belgilagan", "Отметил")}${recordedBy.name ? `: ${recordedBy.name}` : ""} · ${formatDate(recordedBy.at, lang)} ${formatTime(recordedBy.at)}`
                  : tr("Davomat hali belgilanmagan", "Журнал ещё не отмечен")
              }
              students={groupStudents.map((s) => ({
                id: s.id,
                fullName: s.fullName,
                phone: s.phone,
                charged: chargedStudentIds.has(s.id),
              }))}
              marks={marks}
              onSetStatus={setStatus}
              onMarkAllPresent={markAllPresent}
              loading={isRosterLoading}
              labels={{
                statusName: (status) => t(ATTENDANCE_STATUS_META[status].key),
                markAllPresent: tr("Hammasi kelgan deb belgilash", "Отметить всех пришедшими"),
                chargedNote: tr("hisobdan yechilgan", "списано"),
                emptyRoster: tr("Guruhda faol o'quvchi yo'q", "В группе нет активных учеников"),
              }}
            />
          </>
        )}
      </div>

      {/* ══ Сохранение ══
          Внизу, а не в шапке: на телефоне со списком из двадцати учеников
          кнопка в шапке требовала прокрутить всё обратно наверх. */}
      {lesson && groupStudents.length > 0 && (
        <StickyActionBar
          status={
            <span className="tabular-nums">
              {tr("Belgilangan", "Отмечено")}: {markedCount}/{groupStudents.length}
              {hasChanges && (
                <span className="ml-2 text-warn">
                  · {tr("saqlanmagan", "не сохранено")}
                </span>
              )}
            </span>
          }
        >
          <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="gap-2">
            <Save className="size-4" />
            {isSaving ? "…" : t("att.saveAll")}
          </Button>
        </StickyActionBar>
      )}
    </PageShell>
  );
}
