import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, MapPin, Users, ChevronRight, ClipboardCheck, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { StatRow } from "@/components/edu/stat-row";
import { LeafLessonsIcon, LeafStudentsIcon, LeafAttendanceIcon, LeafGradeIcon } from "@/components/edu/icons/leaf-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { attendancePercentage } from "@/lib/data/metrics";
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

  // KPI: davomat % и средний балл по моим группам
  const myLessonIds = useMemo(() => {
    const ids = new Set(lessons.filter((l) => myGroupIds.has(l.groupId)).map((l) => l.id));
    return ids;
  }, [lessons, myGroupIds]);
  const myAttendance = useMemo(() => attendance.filter((a) => myLessonIds.has(a.lessonId)), [attendance, myLessonIds]);
  const attPct = attendancePercentage(myAttendance);
  const myGrades = useMemo(() => grades.filter((g) => myGroupIds.has(g.groupId)), [grades, myGroupIds]);
  const avgGrade = useMemo(() => {
    if (!myGrades.length) return 0;
    return Math.round((myGrades.reduce((s, g) => s + (g.score / g.maxScore) * 10, 0) / myGrades.length) * 10) / 10;
  }, [myGrades]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  if (isLoading) {
    return (
      <PageShell title={tr("Bugun", "Сегодня")} subtitle={formatDate(today.toISOString(), lang)}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="glass-surface flex items-center gap-6 rounded-2xl p-8">
            <Skeleton className="h-16 w-20 shrink-0 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-48 max-w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:h-full lg:justify-between">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-surface flex items-center gap-3 rounded-2xl px-5 py-4">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      </PageShell>
    );
  }

  const nextGroup = next ? groupById[next.groupId] : undefined;
  const nextCourse = nextGroup ? courseById[nextGroup.courseId] : undefined;

  return (
    <PageShell
      title={tr("Bugun", "Сегодня")}
      subtitle={formatDate(today.toISOString(), lang)}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" asChild>
          <Link to="/teacher/attendance">
            <ClipboardCheck className="size-3.5" /> {tr("Davomat", "Посещаемость")}
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Hero: next lesson — the one thing a teacher opens this page for */}
        {next && nextGroup ? (
          <Link
            to="/teacher/attendance"
            className="group glass-surface flex flex-wrap items-center gap-6 rounded-2xl p-8 transition-colors hover:border-primary/40"
          >
            <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 py-4 text-primary">
              <div className="text-2xl font-semibold tabular-nums tracking-tight">{formatTime(next.datetime)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {tr("Keyingi dars", "Следующий урок")}
              </div>
              <div className="mt-1 truncate text-xl font-semibold">
                {nextGroup.name}
                {nextCourse?.name && <span className="font-normal text-muted-foreground"> · {nextCourse.name}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {roomById[next.roomId]?.name ?? "—"}</span>
                <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {nextGroup.studentIds.length}</span>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[12.5px] font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5">
              <ClipboardCheck className="size-4" /> {tr("Davomat belgilash", "Отметить посещаемость")}
            </span>
          </Link>
        ) : (
          <div className="glass-surface flex flex-col items-center justify-center gap-2 rounded-2xl p-10 text-center">
            <AlertCircle className="size-8 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">{tr("Bugun darslar yo'q", "Сегодня уроков нет")}</div>
          </div>
        )}

        {/* Compact KPI column */}
        <div className="flex flex-col gap-3 lg:h-full lg:justify-between">
          <StatRow tone="blue" icon={LeafLessonsIcon} value={todayLessons.length} label={tr("Bugungi darslar", "Уроки сегодня")} />
          <StatRow tone="violet" icon={LeafStudentsIcon} value={totalStudents} label={tr("O'quvchilar", "Ученики")} />
          <StatRow tone="green" icon={LeafAttendanceIcon} value={`${attPct}%`} label={tr("Davomat", "Посещаемость")} />
          <StatRow tone="amber" icon={LeafGradeIcon} value={avgGrade} label={tr("O'rtacha baho", "Средний балл")} />
        </div>
      </div>

      {/* Full schedule — everything summarized in the hero above, in detail */}
      <div className="mt-6 rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="text-[13px] font-medium">{tr("Bugungi darslar", "Расписание на сегодня")}</div>
          <span className="text-[12px] text-muted-foreground">{todayLessons.length}</span>
        </div>
        {todayLessons.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            {tr("Bugun darslar yo'q", "Сегодня занятий нет")}
          </div>
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
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40"
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
                      <span className="flex items-center gap-0.5"><MapPin className="size-2.5" /> {room?.name ?? "—"}</span>
                      <span className="flex items-center gap-0.5"><Users className="size-2.5" /> {group.studentIds.length}</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
