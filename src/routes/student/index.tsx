import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookOpen, Calendar, ChevronRight, Clock, MapPin, Wallet, Layers, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStudentId } from "@/lib/data/identity";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data/store";
import { formatDate, formatMoney, formatTime, getPaymentLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/student/")({ component: StudentHome });

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function StudentHome() {
  const studentId = useCurrentStudentId();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { students, groups, courses, lessons, rooms, homework, submissions, payments, isLoading } = useData();

  const student = useMemo(
    () => students.find((item) => item.id === studentId),
    [students, studentId],
  );

  const myGroups = useMemo(
    () => (studentId ? groups.filter((group) => group.studentIds.includes(studentId)) : []),
    [groups, studentId],
  );
  const myGroupIds = useMemo(() => new Set(myGroups.map((group) => group.id)), [myGroups]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((room) => [room.id, room])), [rooms]);

  const upcomingLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => myGroupIds.has(lesson.groupId) && new Date(lesson.datetime).getTime() >= Date.now())
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons, myGroupIds],
  );
  const nextLesson = upcomingLessons[0];
  const nextGroup = nextLesson ? groupById[nextLesson.groupId] : undefined;
  const nextCourse = nextGroup ? courseById[nextGroup.courseId] : undefined;
  const nextRoom = nextLesson ? roomById[nextLesson.roomId] : undefined;

  const activeHomeworkCount = useMemo(() => {
    if (!studentId) return 0;
    return homework.filter((item) => {
      if (!myGroupIds.has(item.groupId)) return false;
      const submission = submissions.find(
        (sub) => sub.homeworkId === item.id && sub.studentId === studentId,
      );
      return !submission || submission.status === "pending" || submission.status === "late";
    }).length;
  }, [homework, myGroupIds, studentId, submissions]);

  const todayLessonsCount = useMemo(() => {
    const today = new Date();
    return lessons.filter((lesson) => {
      const date = new Date(lesson.datetime);
      return (
        myGroupIds.has(lesson.groupId) &&
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    }).length;
  }, [lessons, myGroupIds]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="mx-auto max-w-md px-4 py-5">
        <Card className="p-5 shadow-elegant">
          <div className="text-sm font-semibold">{lang === "uz" ? "Profil yuklanmoqda..." : "Загрузка профиля..."}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("studentHome.profileSync")}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5 pb-24">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("studentHome.today")}</div>
        <h1 className="text-2xl font-bold">{student.fullName}</h1>
      </div>

      <Card className="overflow-hidden bg-gradient-primary p-5 text-primary-foreground shadow-glow">
        <div className="flex items-center gap-2 text-xs opacity-80">
          <Clock className="size-3" /> {t("studentHome.nextLesson")}
        </div>
        <div className="mt-2 text-2xl font-bold">{nextCourse?.name ?? nextGroup?.name ?? t("studentHome.noUpcoming")}</div>
        <div className="mt-1 text-sm opacity-90">{nextGroup?.name ?? t("studentHome.clearSchedule")}</div>
        <div className="mt-3 flex items-center gap-3 text-xs opacity-90">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {nextLesson ? formatTime(nextLesson.datetime) : "--:--"}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            {nextRoom?.name ?? t("studentHome.noRoom")}
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <QuickCard
          to="/student/profile"
          icon={Wallet}
          label={t("studentHome.balance")}
          value={formatMoney(student.balance, lang)}
          hint={student.balance < 0 ? t("studentHome.debt") : t("studentHome.paid")}
          tone={student.balance < 0 ? "warning" : "success"}
        />
        <QuickCard
          to="/student/homework"
          icon={BookOpen}
          label={t("studentHome.homework")}
          value={String(activeHomeworkCount)}
          hint={t("studentHome.activeTasks")}
          tone="warning"
        />
        <QuickCard
          to="/student/schedule"
          icon={Calendar}
          label={t("studentHome.lessons")}
          value={String(todayLessonsCount)}
          hint={t("studentHome.todayLower")}
          tone="primary"
        />
      </div>

      <Card className="p-4 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("studentHome.myGroups")}</h3>
          <Badge variant="outline" className="text-[10px]">
            {myGroups.length} {t("studentHome.active")}
          </Badge>
        </div>
        <div className="space-y-2">
          {myGroups.length === 0 ? (
            <EmptyState
              className="min-h-0 py-6"
              icon={<Layers className="size-6" />}
              title={t("studentHome.noGroups")}
            />
          ) : (
            myGroups.map((group) => {
              const course = courseById[group.courseId];
              const gLessons = lessons.filter((l) => l.groupId === group.id);
              const completed = gLessons.filter((l) => l.status === "completed").length;
              const progress = gLessons.length > 0 ? Math.round((completed / gLessons.length) * 100) : 0;
              return (
                <Link
                  key={group.id}
                  to="/student/schedule"
                  className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent/40"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-primary text-sm font-bold text-primary-foreground">
                    {initials(course?.name ?? group.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{course?.name ?? group.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{group.name}</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-gradient-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>
      </Card>
      <Card className="p-4 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("studentHome.balance")}</h3>
          <Badge variant="outline" className="text-[10px]">
            {t("studentHome.lastPayments")}
          </Badge>
        </div>
        <div className="space-y-1.5">
          {(() => {
            const myPayments = payments
              .filter((p) => p.studentId === studentId)
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10);
            if (myPayments.length === 0) {
              return (
                <EmptyState
                  className="min-h-0 py-6"
                  icon={<Receipt className="size-6" />}
                  title={t("studentHome.noPayments")}
                />
              );
            }
            return myPayments.map((p) => {
              const isIncome = p.direction === "in";
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex size-7 items-center justify-center rounded-md text-xs font-bold ${isIncome ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {isIncome ? "+" : "−"}
                    </div>
                    <div>
                      <div className="text-xs font-medium">
                        {getPaymentLabel(p.type, lang)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(p.date, lang)}</div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${isIncome ? "text-success" : "text-destructive"}`}>
                    {isIncome ? "+" : "−"}{formatMoney(p.amount, lang)}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </Card>
    </div>
  );
}

function QuickCard({ to, icon: Icon, label, value, hint, tone }: {
  to: string;
  icon: typeof Clock;
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "info";
}) {
  const tones = {
    primary: "bg-accent text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/10 text-info",
  };
  return (
    <Link to={to} className="block">
      <Card className="gap-2 p-4 shadow-elegant transition-all active:scale-95">
        <div className={`flex size-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </Card>
    </Link>
  );
}
