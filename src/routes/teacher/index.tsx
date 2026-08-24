import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Calendar,
  ChevronRight,
  ClipboardCheck,
  Clock,
  MapPin,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { attendancePercentage, gradeAverage } from "@/lib/data/metrics";
import { formatDate, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/teacher/")({ component: TeacherHome });

function TeacherHome() {
  const { lang } = useI18n();
  const { groups, lessons, rooms, courses, attendance, grades, isLoading } = useData();
  const teacherId = useCurrentTeacherId();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const myGroups = useMemo(() => groups.filter((g) => g.teacherId === teacherId), [groups, teacherId]);
  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups]);
  const today = new Date();

  const todayLessons = useMemo(
    () =>
      lessons
        .filter((l) => myGroupIds.has(l.groupId) && sameDay(new Date(l.datetime), today))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons, myGroupIds],
  );

  const next = todayLessons.find((l) => new Date(l.datetime).getTime() >= Date.now()) ?? todayLessons[0];
  const totalStudents = useMemo(() => new Set(myGroups.flatMap((g) => g.studentIds)).size, [myGroups]);

  const myLessonIds = useMemo(
    () => new Set(lessons.filter((l) => myGroupIds.has(l.groupId)).map((l) => l.id)),
    [lessons, myGroupIds],
  );
  const myAttendance = useMemo(
    () => attendance.filter((a) => myLessonIds.has(a.lessonId)),
    [attendance, myLessonIds],
  );
  const attPct = attendancePercentage(myAttendance);
  const myGrades = useMemo(() => grades.filter((g) => myGroupIds.has(g.groupId)), [grades, myGroupIds]);
  const avgGrade = useMemo(() => gradeAverage(myGrades), [myGrades]);

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  if (isLoading) {
    return (
      <PageShell title={tr("Bugun", "Сегодня")} subtitle={formatDate(today.toISOString(), lang)}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  const nextGroup = next ? groupById[next.groupId] : undefined;

  return (
    <PageShell
      title={tr("Bugun", "Сегодня")}
      subtitle={formatDate(today.toISOString(), lang)}
      actions={
        <Button size="sm" className="gap-1.5" asChild>
          <Link to="/teacher/attendance">
            <ClipboardCheck className="size-3.5" /> {tr("Davomat", "Посещаемость")}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ══ Следующий урок ══
            Стоит первым и занимает больше места, чем всё остальное: учитель
            открывает экран ради одного вопроса — «что у меня сейчас». Раньше
            эта карточка стояла ПОД показателями и была окрашена в старый
            синий бренд прямым кодом цвета. */}
        {next && nextGroup && (
          <Link
            to="/teacher/attendance"
            className="flex items-center gap-4 rounded-xl bg-sidebar p-4 text-sidebar-foreground transition-opacity hover:opacity-95"
          >
            <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-white/10 py-2">
              <Clock className="size-3.5" />
              <div className="text-base font-bold tabular-nums">{formatTime(next.datetime)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
                {tr("Keyingi dars", "Следующий урок")}
              </div>
              <div className="truncate text-base font-semibold">{nextGroup.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-sidebar-foreground/70">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" /> {roomById[next.roomId]?.name ?? "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" /> {nextGroup.studentIds.length}
                </span>
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-sidebar-foreground/60" />
          </Link>
        )}

        {/* ══ Показатели ══ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={tr("Bugungi darslar", "Уроки сегодня")} value={todayLessons.length} icon={Calendar} color="blue" />
          <KpiCard label={tr("O'quvchilar", "Ученики")} value={totalStudents} icon={Users} color="violet" />
          <KpiCard label={tr("Davomat", "Посещаемость")} value={`${attPct}%`} icon={TrendingUp} color="green" />
          <KpiCard label={tr("O'rtacha baho", "Средний балл")} value={avgGrade} icon={Star} color="amber" />
        </div>

        {/* ══ Занятия дня ══ */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-[13px] font-semibold">{tr("Bugungi darslar", "Сегодняшние занятия")}</div>
            <span className="text-[12px] text-muted-foreground">{todayLessons.length}</span>
          </div>

          {todayLessons.length === 0 ? (
            <EmptyState
              icon={<Calendar className="size-6" />}
              title={tr("Bugun darslar yo'q", "Сегодня занятий нет")}
              description={tr(
                "Dam oling yoki keyingi darslarga tayyorlaning.",
                "Можно отдохнуть или подготовиться к следующим занятиям.",
              )}
            />
          ) : (
            <div className="divide-y divide-border">
              {todayLessons.map((lesson) => {
                const group = groupById[lesson.groupId];
                if (!group) return null;
                const room = roomById[lesson.roomId];
                const course = courseById[group.courseId];
                return (
                  <Link
                    key={lesson.id}
                    to="/teacher/attendance"
                    // min-h-11 — 44px: строка сама по себе цель для пальца.
                    className="edu-row flex min-h-11 items-center gap-3 px-4 py-2.5"
                  >
                    <div className="flex w-12 shrink-0 items-center gap-1 text-[13px] font-medium tabular-nums">
                      <Clock className="size-3 text-muted-foreground" />
                      {formatTime(lesson.datetime)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{group.name}</span>
                        {lesson.status !== "scheduled" && <LessonStatusBadge status={lesson.status} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {course?.name && <span>{course.name}</span>}
                        <span className="flex items-center gap-0.5">
                          <MapPin className="size-2.5" /> {room?.name ?? "—"}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Users className="size-2.5" /> {group.studentIds.length}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
