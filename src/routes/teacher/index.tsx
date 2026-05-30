import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, MapPin, Users, ChevronRight, ClipboardCheck, Calendar, Layers } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Button } from "@/components/ui/button";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/teacher/")({ component: TeacherHome });

function TeacherHome() {
  const { lang } = useI18n();
  const { groups, lessons, rooms, courses, isLoading } = useData();
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
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const nextGroup = next ? groupById[next.groupId] : undefined;

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
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label={tr("Mening guruhlarim", "Мои группы")} value={myGroups.length} icon={Layers} iconColor="blue" />
        <KpiCard label={tr("O'quvchilar", "Ученики")} value={totalStudents} icon={Users} iconColor="violet" />
        <KpiCard label={tr("Bugungi darslar", "Занятий сегодня")} value={todayLessons.length} icon={Calendar} iconColor="green" />
      </div>

      {/* Next lesson highlight */}
      {next && nextGroup && (
        <Link
          to="/teacher/attendance"
          className="mt-4 flex items-center gap-4 rounded-md border border-blue-600/30 bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
        >
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md bg-blue-600 py-1.5 text-white">
            <Clock className="size-3.5" />
            <div className="text-base font-bold tabular-nums">{formatTime(next.datetime)}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {tr("Keyingi dars", "Следующее занятие")}
            </div>
            <div className="truncate text-[15px] font-semibold">{nextGroup.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="size-3" /> {roomById[next.roomId]?.name ?? "—"}</span>
              <span className="flex items-center gap-1"><Users className="size-3" /> {nextGroup.studentIds.length}</span>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Today lessons list */}
      <div className="mt-4 rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[13px] font-medium">{tr("Bugungi darslar", "Сегодняшние занятия")}</div>
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
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
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
