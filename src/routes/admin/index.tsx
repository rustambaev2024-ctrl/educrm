import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, UserPlus, AlertCircle, Calendar, ArrowRight, Clock, MapPin, Layers } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { StatCard } from "@/components/edu/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const { t, lang } = useI18n();
  const { students, groups, lessons, payments, staff, rooms, courses, branches } = useData();

  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const newThisWeek = students.filter((s) => new Date(s.registeredAt) >= weekAgo).length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0);
  const debtTotal = debtors.reduce((sum, s) => sum + Math.abs(Math.min(0, s.balance)), 0);
  const activeGroups = groups.filter((g) => g.status === "active").length;

  const todayLessons = useMemo(
    () =>
      lessons
        .filter((l) => sameDay(new Date(l.datetime), today))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons],
  );

  const recentPayments = useMemo(
    () => [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [payments],
  );

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const branchName = branches[0]?.name ?? "";

  return (
    <>
      <PageHeader
        title={branchName || t("admin.title")}
        description={t("admin.subtitle")}
        actions={
          <Button className="bg-gradient-primary text-primary-foreground shadow-elegant" asChild>
            <Link to="/admin/students"><UserPlus className="mr-1 size-4" /> {t("students.add")}</Link>
          </Button>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t("director.activeStudents")} value={`${activeStudents}`} icon={Users} tone="primary" />
          <StatCard label={t("admin.newStudents")} value={`${newThisWeek}`} hint={t("admin.weekRange")} icon={UserPlus} tone="success" />
          <StatCard label={t("director.debtors")} value={`${debtors.length}`} hint={debtTotal > 0 ? formatMoney(debtTotal, lang) : undefined} icon={AlertCircle} tone="warning" />
          <StatCard label={t("admin.activeGroups")} value={`${activeGroups}`} icon={Layers} tone="info" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 shadow-elegant lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{t("admin.todayLessons")}</h3>
                <p className="text-xs text-muted-foreground">{todayLessons.length}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/schedule">{t("nav.schedule")} <ArrowRight className="ml-1 size-3" /></Link>
              </Button>
            </div>
            {todayLessons.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("schedule.empty")}</div>
            ) : (
              <div className="space-y-2">
                {todayLessons.slice(0, 6).map((l) => {
                  const g = groupById[l.groupId];
                  if (!g) return null;
                  const tch = teacherById[g.teacherId];
                  const room = roomById[l.roomId];
                  const course = courseById[g.courseId];
                  return (
                    <div key={l.id} className="flex items-center gap-4 rounded-lg border border-border/50 bg-card p-3 transition-all hover:border-primary/30 hover:shadow-sm">
                      <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-md bg-accent py-1.5 text-primary">
                        <Clock className="size-3" />
                        <div className="text-sm font-bold">{formatTime(l.datetime)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{g.name}</div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{course?.name}</span>
                          <span>{tch?.fullName.split(" ")[0]}</span>
                          <span className="flex items-center gap-1"><MapPin className="size-3" />{room?.name}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="hidden sm:inline-flex">{g.studentIds.length} {t("students.count")}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{t("admin.recentPayments")}</h3>
                <p className="text-xs text-muted-foreground">{recentPayments.length}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/finance"><ArrowRight className="size-3" /></Link>
              </Button>
            </div>
            {recentPayments.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((p) => {
                  const stu = p.studentId ? studentById[p.studentId] : undefined;
                  const grp = p.groupId ? groupById[p.groupId] : undefined;
                  const positive = p.direction === "in";
                  const negative = p.direction === "out";
                  const name = stu?.fullName ?? (p.category ? t(`status.${p.category}`) ?? p.category : t("nav.finance"));
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-secondary text-xs">
                          {name.split(" ").slice(0, 2).map((x) => x[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{name}</div>
                        <div className="truncate text-xs text-muted-foreground">{grp?.name ?? p.method.toUpperCase()}</div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground"}`}>
                        {positive ? "+" : negative ? "−" : ""} {formatMoney(p.amount, lang)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
