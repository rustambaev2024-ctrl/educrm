import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, MapPin, Users, ChevronRight, ClipboardCheck, Calendar } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/teacher/")({ component: TeacherHome });

function TeacherHome() {
  const { t, lang } = useI18n();
  const { groups, lessons, rooms, courses } = useData();
  const teacherId = useCurrentTeacherId();

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
  const totalStudents = useMemo(
    () => new Set(myGroups.flatMap((g) => g.studentIds)).size,
    [myGroups],
  );
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  return (
    <>
      <PageHeader
        title={`${t("common.today")}, ${formatDate(today.toISOString(), lang)}`}
        description={`${todayLessons.length} ${t("schedule.lessonOf")} · ${totalStudents} ${t("teacher.studentsCount")}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/teacher/attendance">
              <ClipboardCheck className="mr-1 size-4" /> {t("teacher.openAttendance")}
            </Link>
          </Button>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {next ? (
            <Card className="bg-gradient-primary p-5 text-primary-foreground shadow-glow">
              <div className="text-xs font-medium uppercase tracking-wider opacity-80">{t("teacher.nextLesson")}</div>
              <div className="mt-2 text-2xl font-bold">{groupById[next.groupId]?.name}</div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-90">
                <span className="flex items-center gap-1"><Clock className="size-4" /> {formatTime(next.datetime)}</span>
                <span className="flex items-center gap-1"><MapPin className="size-4" /> {roomById[next.roomId]?.name}</span>
                <span className="flex items-center gap-1"><Users className="size-4" /> {groupById[next.groupId]?.studentIds.length ?? 0}</span>
              </div>
              <Button variant="secondary" className="mt-4 w-full bg-white/15 text-primary-foreground backdrop-blur hover:bg-white/25" asChild>
                <Link to="/teacher/attendance">
                  <ClipboardCheck className="mr-1 size-4" /> {t("teacher.openAttendance")}
                </Link>
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center shadow-elegant">
              <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Calendar className="size-6" />
              </div>
              <div className="text-sm font-medium">{t("teacher.todayEmpty")}</div>
            </Card>
          )}

          <Card className="p-5 shadow-elegant">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("teacher.myGroups")}</div>
            <div className="mt-2 text-3xl font-bold">{myGroups.length}</div>
            <div className="mt-1 text-sm text-muted-foreground">{totalStudents} {t("teacher.studentsCount")}</div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/teacher/groups">{t("teacher.myGroups")}</Link>
            </Button>
          </Card>

          <Card className="p-5 shadow-elegant">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("nav.schedule")}</div>
            <div className="mt-2 text-3xl font-bold">{todayLessons.length}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t("common.today")}</div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/teacher/groups">
                <Calendar className="mr-1 size-4" /> {t("nav.schedule")}
              </Link>
            </Button>
          </Card>
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">{t("teacher.today")}</h3>
            <Badge variant="outline">{todayLessons.length}</Badge>
          </div>
          {todayLessons.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("teacher.todayEmpty")}</div>
          ) : (
            <div className="space-y-2">
              {todayLessons.map((lesson) => {
                const group = groupById[lesson.groupId];
                if (!group) return null;
                const room = roomById[lesson.roomId];
                const course = courseById[group.courseId];
                const isNext = next?.id === lesson.id && lesson.status === "scheduled";
                return (
                  <Link
                    key={lesson.id}
                    to="/teacher/attendance"
                    className="flex flex-col gap-3 rounded-xl border border-border/50 p-3 transition-all hover:border-primary/40 hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex w-20 flex-shrink-0 flex-col items-center justify-center rounded-xl py-2 ${
                          isNext ? "bg-gradient-primary text-primary-foreground" : "bg-accent text-primary"
                        }`}
                      >
                        <Clock className="size-3.5" />
                        <div className="text-base font-bold">{formatTime(lesson.datetime)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-semibold">
                          {group.name}
                          {isNext && <Badge className="bg-success/10 text-success hover:bg-success/15">{t("common.today")}</Badge>}
                          {lesson.status !== "scheduled" && <LessonStatusBadge status={lesson.status} />}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{course?.name}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-secondary px-2 py-1">Kabinet: {room?.name ?? "—"}</span>
                          <span className="rounded-full bg-secondary px-2 py-1">O'quvchilar: {group.studentIds.length}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-xs font-medium text-foreground sm:ml-auto sm:bg-transparent sm:p-0">
                      <span>Davomatni ochish</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
