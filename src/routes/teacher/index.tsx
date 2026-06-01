import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, MapPin, Users, ChevronRight, ClipboardCheck, Calendar, Layers, TrendingUp, Star } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
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

  // KPI: davomat % Рё СЃСЂРµРґРЅРёР№ Р±Р°Р»Р» РїРѕ РјРѕРёРј РіСЂСѓРїРїР°Рј
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
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const nextGroup = next ? groupById[next.groupId] : undefined;

  return (
    <PageShell
      title={tr("Bugun", "РЎРµРіРѕРґРЅСЏ")}
      subtitle={formatDate(today.toISOString(), lang)}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" asChild>
          <Link to="/teacher/attendance">
            <ClipboardCheck className="size-3.5" /> {tr("Davomat", "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ")}
          </Link>
        </Button>
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={tr("Bugungi darslar", "Р”РЅРµР№ СЃРµРіРѕРґРЅСЏ")} value={todayLessons.length} icon={Calendar} iconColor="blue" />
        <KpiCard label={tr("O'quvchilar", "РЈС‡РµРЅРёРєРё")} value={totalStudents} icon={Users} iconColor="violet" />
        <KpiCard label={tr("Davomat", "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ")} value={`${attPct}%`} icon={TrendingUp} iconColor="green" />
        <KpiCard label={tr("O'rtacha baho", "РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»")} value={avgGrade} icon={Star} iconColor="amber" />
      </div>

      {/* Next lesson highlight */}
      {next && nextGroup && (
        <Link
          to="/teacher/attendance"
          className="mt-4 flex items-center gap-4 rounded-md border border-[#e2e8f0] bg-white p-4 transition-colors hover:bg-[#f8fafc]"
        >
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md bg-[#0077b6] py-1.5 text-white">
            <Clock className="size-3.5" />
            <div className="text-base font-bold tabular-nums">{formatTime(next.datetime)}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748b]">
              {tr("Keyingi dars", "РЎР»РµРґСѓСЋС‰РµРµ Р·Р°РЅСЏС‚РёРµ")}
            </div>
            <div className="truncate text-[15px] font-semibold">{nextGroup.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="size-3" /> {roomById[next.roomId]?.name ?? "вЂ”"}</span>
              <span className="flex items-center gap-1"><Users className="size-3" /> {nextGroup.studentIds.length}</span>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Today lessons list */}
      <div className="mt-4 rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[13px] font-medium">{tr("Bugungi darslar", "РЎРµРіРѕРґРЅСЏС€РЅРёРµ Р·Р°РЅСЏС‚РёСЏ")}</div>
          <span className="text-[12px] text-muted-foreground">{todayLessons.length}</span>
        </div>
        {todayLessons.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            {tr("Bugun darslar yo'q", "РЎРµРіРѕРґРЅСЏ Р·Р°РЅСЏС‚РёР№ РЅРµС‚")}
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
                      <span className="flex items-center gap-0.5"><MapPin className="size-2.5" /> {room?.name ?? "вЂ”"}</span>
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
