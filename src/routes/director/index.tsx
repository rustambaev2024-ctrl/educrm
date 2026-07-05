import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Users, Wallet, TrendingUp, AlertCircle, Activity, BookOpen, ArrowRight, Building2, Award, Clock,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data/store";
import { attendancePercentage } from "@/lib/data/metrics";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/director/")({ component: DirectorHome });

function DirectorHome() {
  const { t, lang } = useI18n();
  const {
    students, groups, staff, courses, branches, payments, lessons, attendance, auditLog, isLoading,
  } = useData();

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const monthly = useMemo(() => {
    const inMonth = payments.filter((p) => new Date(p.date).getTime() >= monthStart);
    const income = inMonth.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
    const expense = inMonth.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
    return { income, expense, profit: income - expense };
  }, [payments, monthStart]);

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0).length;
  const activeGroups = groups.filter((g) => g.status === "active").length;

  const attendancePct = useMemo(() => attendancePercentage(attendance), [attendance]);

  // Daily revenue for last 14 days
  const revenueSeries = useMemo(() => {
    const days: { day: string; income: number; expense: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const inDay = payments.filter((p) => {
        const t = new Date(p.date).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      days.push({
        day: `${d.getDate()}.${d.getMonth() + 1}`,
        income: inDay.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0) / 1_000_000,
        expense: inDay.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0) / 1_000_000,
      });
    }
    return days;
  }, [payments]);

  const courseRevenue = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    return courses
      .map((course) => {
        const courseGroupIds = new Set(groups.filter((g) => g.courseId === course.id).map((g) => g.id));
        const revenue = payments
          .filter((p) => {
            if (p.type !== "charge") return false;
            if (!p.groupId || !courseGroupIds.has(p.groupId)) return false;
            const d = new Date(p.date);
            return d.getMonth() === curMonth && d.getFullYear() === curYear;
          })
          .reduce((sum, p) => sum + p.amount, 0);
        return { name: course.name, revenue };
      })
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [courses, groups, payments]);

  const topTeachers = useMemo(() => {
    const teachers = staff.filter((s) => s.role === "teacher");
    return teachers
      .map((tch) => {
        const tGroups = groups.filter((g) => g.teacherId === tch.id);
        const studentSet = new Set<string>();
        tGroups.forEach((g) => g.studentIds.forEach((sid) => studentSet.add(sid)));
        const courseName = tGroups.length > 0 ? courses.find((c) => c.id === tGroups[0].courseId)?.name ?? "—" : "—";
        // Real attendance: filter attendance records for this teacher's groups' lessons
        const tGroupIds = new Set(tGroups.map((g) => g.id));
        const tLessonIds = new Set(lessons.filter((l) => tGroupIds.has(l.groupId)).map((l) => l.id));
        const tAtt = attendance.filter((a) => tLessonIds.has(a.lessonId));
        const attScore = tAtt.length > 0
          ? Math.round((tAtt.filter((a) => a.status !== "absent").length / tAtt.length) * 100)
          : 0;
        return {
          id: tch.id,
          name: tch.fullName,
          subject: courseName,
          students: studentSet.size,
          attendance: attScore,
        };
      })
      .sort((a, b) => b.students - a.students)
      .slice(0, 5);
  }, [staff, groups, courses, lessons, attendance]);

  const recentAudit = auditLog.slice(0, 6);
  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b])), [branches]);

  if (isLoading) {
    return (
      <PageShell title={t("director.title")} subtitle={t("director.subtitle")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={t("director.title")} subtitle={t("director.subtitle")}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("director.activeStudents")} value={`${activeStudents}`} icon={Users} iconColor="blue" />
          <KpiCard label={t("director.monthlyRevenue")} value={formatMoney(monthly.income, lang)} icon={Wallet} iconColor="green" />
          <KpiCard label={t("director.profit")} value={formatMoney(monthly.profit, lang)} icon={TrendingUp} iconColor={monthly.profit >= 0 ? "violet" : "red"} />
          <KpiCard label={t("director.debtors")} value={`${debtors}`} subtitle={t("students.count")} icon={AlertCircle} iconColor="amber" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 shadow-elegant lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{t("director.monthlyRevenue")}</h3>
                <p className="text-xs text-muted-foreground">{t("admin.weekRange")} · mln UZS</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Legend color="#22c55e" label={t("director.monthlyRevenue")} />
                <Legend color="#ef4444" label={t("director.monthlyExpense")} />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueSeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dr-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dr-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any, name: string) => [`${Number(value).toFixed(1)} mln`, name]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="income" name={t("finance.kpi.income")} stroke="#22c55e" fill="url(#dr-in)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name={t("finance.kpi.expense")} stroke="#ef4444" fill="url(#dr-out)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("director.byCourse")}</h3>
              <p className="text-xs text-muted-foreground">mln UZS</p>
            </div>
            {courseRevenue.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={courseRevenue} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 shadow-elegant lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{t("director.topTeachers")}</h3>
                <p className="text-xs text-muted-foreground">{t("director.attendanceAvg")}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/director/staff">{t("admin.viewAll")} <ArrowRight className="ml-1 size-3" /></Link>
              </Button>
            </div>
            {topTeachers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <div className="space-y-2">
                {topTeachers.map((tch, i) => (
                  <div key={tch.id} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-accent/40">
                    <div className="flex size-7 items-center justify-center rounded-md bg-gradient-primary text-xs font-bold text-primary-foreground">{i + 1}</div>
                    <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                      {tch.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{tch.name}</div>
                      <div className="text-xs text-muted-foreground">{tch.subject} · {tch.students} {t("students.count")}</div>
                    </div>
                    <Badge className="bg-success/10 text-success hover:bg-success/15">{tch.attendance}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("director.recentActivity")}</h3>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/director/audit"><ArrowRight className="size-3" /></Link>
              </Button>
            </div>
            {recentAudit.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("audit.empty")}</div>
            ) : (
              <div className="space-y-3">
                {recentAudit.map((a) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                      <Activity className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.summary}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{a.actorName}</span>
                        <span>·</span>
                        <Clock className="size-2.5" />
                        <span>{formatDateTime(a.createdAt, lang)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <QuickLink to="/director/branches" icon={Building2} label={t("nav.branches")} hint={`${branches.length}`} />
          <QuickLink to="/director/staff" icon={Award} label={t("nav.staff")} hint={`${staff.length}`} />
          <QuickLink to="/director/analytics" icon={BookOpen} label={t("director.activeGroups")} hint={`${activeGroups}`} />
        </div>
      </div>
    </PageShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, hint }: { to: string; icon: typeof Building2; label: string; hint: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-elegant">
      <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium group-hover:text-primary">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
