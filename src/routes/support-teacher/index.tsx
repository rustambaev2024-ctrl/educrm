import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, MapPin, Users, ChevronRight, ClipboardCheck, Calendar, BookOpen, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/support-teacher/")({ component: SupportTeacherHome });

function SupportTeacherHome() {
  const { lang } = useI18n();
  // Группы из store уже отфильтрованы бэкендом по учителям этого помощника.
  const { groups, lessons, rooms, courses, homework, submissions, isLoading } = useData();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const myGroupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
  const today = new Date();

  const todayLessons = useMemo(
    () =>
      lessons
        .filter((l) => myGroupIds.has(l.groupId) && sameDay(new Date(l.datetime), today))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons, myGroupIds],
  );

  const next = todayLessons.find((l) => new Date(l.datetime).getTime() >= Date.now()) ?? todayLessons[0];
  const totalStudents = useMemo(() => new Set(groups.flatMap((g) => g.studentIds)).size, [groups]);

  // Непроверенные ДЗ — статусы submitted/late по моим группам
  const myHomework = useMemo(() => homework.filter((h) => myGroupIds.has(h.groupId)), [homework, myGroupIds]);
  const ungradedCount = useMemo(() => {
    const myHwIds = new Set(myHomework.map((h) => h.id));
    return submissions.filter((s) => myHwIds.has(s.homeworkId) && (s.status === "submitted" || s.status === "late")).length;
  }, [myHomework, submissions]);

  const pendingHomework = useMemo(() => {
    const myHwIds = new Set(myHomework.map((h) => h.id));
    return myHomework
      .map((h) => {
        const subs = submissions.filter((s) => s.homeworkId === h.id && (s.status === "submitted" || s.status === "late"));
        return { hw: h, pending: subs.length };
      })
      .filter((x) => myHwIds.has(x.hw.id) && x.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);
  }, [myHomework, submissions]);

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  if (isLoading) {
    return (
      <PageShell title={tr("Bugun", "Сегодня")} subtitle={formatDate(today.toISOString(), lang)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (groups.length === 0) {
    return (
      <PageShell title={tr("Bugun", "Сегодня")} subtitle={formatDate(today.toISOString(), lang)}>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-warn-soft">
            <AlertCircle className="size-7 text-warn" />
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">
              {tr("Siz hali hech qaysi o'qituvchiga biriktirilmagansiz", "Вы ещё не привязаны ни к одному учителю")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {tr("Administrator sizni o'qituvchiga biriktirishi kerak", "Обратитесь к администратору для привязки к учителю")}
            </div>
          </div>
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
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" asChild>
          <Link to="/support-teacher/attendance">
            <ClipboardCheck className="size-3.5" /> {tr("Davomat", "Посещаемость")}
          </Link>
        </Button>
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={tr("Bugungi darslar", "Уроки сегодня")} value={todayLessons.length} icon={Calendar} iconColor="blue" />
        <KpiCard label={tr("O'quvchilar", "Ученики")} value={totalStudents} icon={Users} iconColor="violet" />
        <KpiCard label={tr("Tekshirilmagan DZ", "Непроверенные ДЗ")} value={ungradedCount} icon={BookOpen} iconColor="amber" />
      </div>

      {/* Next lesson highlight */}
      {next && nextGroup && (
        <Link
          to="/support-teacher/attendance"
          className="mt-4 flex items-center gap-4 rounded-xl bg-sidebar p-4 text-sidebar-foreground transition-opacity hover:opacity-95"
        >
          <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-white/10 py-2">
            <Clock className="size-3.5" />
            <div className="text-base font-bold tabular-nums">{formatTime(next.datetime)}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
              {tr("Keyingi dars", "Следующий урок")}
            </div>
            <div className="truncate text-[15px] font-semibold">{nextGroup.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-sidebar-foreground/70">
              <span className="flex items-center gap-1"><MapPin className="size-3" /> {roomById[next.roomId]?.name ?? "—"}</span>
              <span className="flex items-center gap-1"><Users className="size-3" /> {nextGroup.studentIds.length}</span>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-sidebar-foreground/60" />
        </Link>
      )}

      {/* Today lessons list */}
      <div className="mt-4 rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[13px] font-medium">{tr("Bugungi darslar", "Сегодняшние занятия")}</div>
          <span className="text-[12px] text-muted-foreground">{todayLessons.length}</span>
        </div>
        {todayLessons.length === 0 ? (
          <EmptyState
            icon={<Calendar className="size-6" />}
            title={tr("Bugun darslar yo'q", "Сегодня занятий нет")}
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
                  to="/support-teacher/attendance"
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

      {/* Pending homework to review */}
      {pendingHomework.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-[13px] font-medium">{tr("Tekshirilmagan vazifalar", "Непроверенные задания")}</div>
            <span className="text-[12px] text-muted-foreground">{pendingHomework.length}</span>
          </div>
          <div className="divide-y divide-border">
            {pendingHomework.map(({ hw, pending }) => {
              const group = groupById[hw.groupId];
              return (
                <Link
                  key={hw.id}
                  to="/support-teacher/homework"
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warn-soft text-warn">
                    <BookOpen className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{hw.title}</div>
                    <div className="text-[11px] text-muted-foreground">{group?.name ?? "—"}</div>
                  </div>
                  <span className="rounded-md bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                    {pending}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}
