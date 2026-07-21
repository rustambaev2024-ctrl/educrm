import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertCircle, Activity, BookOpen, ArrowRight, Building2, Award, Clock, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PageShell } from "@/components/edu/page-shell";
import { StatRow } from "@/components/edu/stat-row";
import { LeafStudentsIcon, LeafProfitIcon, LeafDebtorsIcon } from "@/components/edu/icons/leaf-icons";
import { AreaChartGradient } from "@/components/edu/area-chart-gradient";
import { DonutWithLegend } from "@/components/edu/donut-with-legend";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data/store";
import { attendancePercentage } from "@/lib/data/metrics";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/director/")({ component: DirectorHome });

function DirectorHome() {
  const { t, lang, plural } = useI18n();
  const {
    students, groups, staff, courses, branches, payments, lessons, attendance, auditLog, isLoading,
  } = useData();

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const prevMonthStart = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1, 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const monthly = useMemo(() => {
    const inMonth = payments.filter((p) => new Date(p.date).getTime() >= monthStart);
    const income = inMonth.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
    const expense = inMonth.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
    return { income, expense, profit: income - expense };
  }, [payments, monthStart]);

  const prevMonthIncome = useMemo(() => {
    return payments
      .filter((p) => {
        const t = new Date(p.date).getTime();
        return t >= prevMonthStart && t < monthStart && p.direction === "in";
      })
      .reduce((s, p) => s + p.amount, 0);
  }, [payments, prevMonthStart, monthStart]);

  const revenueDeltaPct = prevMonthIncome > 0
    ? Math.round(((monthly.income - prevMonthIncome) / prevMonthIncome) * 100)
    : null;

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0).length;
  const activeGroups = groups.filter((g) => g.status === "active").length;

  const attendancePct = useMemo(() => attendancePercentage(attendance), [attendance]);

  const attendanceBreakdown = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const a of attendance) counts[a.status]++;
    return counts;
  }, [attendance]);

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
  const moneyUnit = lang === "uz" ? "mln so'm" : "млн сум";
  const hasRevenueData = revenueSeries.some((item) => item.income > 0 || item.expense > 0);
  const sectionDividerLabel = lang === "uz" ? "Sahifada davomi" : "Далее на странице";
  const deltaLabel = lang === "uz" ? "o'tgan oyga nisbatan" : "к прошлому месяцу";

  if (isLoading) {
    return (
      <PageShell title={t("director.title")} subtitle={t("director.subtitle")}>
        <div className="space-y-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="glass-surface flex flex-col gap-6 rounded-2xl p-8 lg:p-10">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-12 w-72 max-w-full" />
              <Skeleton className="h-[220px] w-full rounded-xl" />
            </div>
            <div className="flex flex-col gap-4 lg:h-full lg:justify-between">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-surface flex items-center gap-3 rounded-2xl px-5 py-4">
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={t("director.title")} subtitle={t("director.subtitle")}>
      <div className="space-y-10">
        {/* ── Hero: revenue number + chart, flanked by a compact stat column ── */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="glass-surface rounded-2xl p-8 lg:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("director.monthlyRevenue")}
                </div>
                <div className="mt-2 truncate text-4xl font-light tracking-tight tabular-nums text-foreground sm:text-5xl">
                  {formatMoney(monthly.income, lang)}
                </div>
                {revenueDeltaPct !== null && (
                  <div
                    className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      revenueDeltaPct >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {revenueDeltaPct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {revenueDeltaPct >= 0 ? "+" : ""}{revenueDeltaPct}% {deltaLabel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Legend color="#1f6e50" label={t("director.monthlyRevenue")} />
                <Legend color="#ef5a5a" label={t("director.monthlyExpense")} />
              </div>
            </div>

            <div className="mt-6">
              {hasRevenueData ? (
                <div className="chart-glow">
                  <AreaChartGradient
                    height={220}
                    data={revenueSeries}
                    xKey="day"
                    series={[
                      { dataKey: "income", name: t("finance.kpi.income"), color: "#1f6e50" },
                      { dataKey: "expense", name: t("finance.kpi.expense"), color: "#ef5a5a" },
                    ]}
                    valueFormatter={(v) => `${v.toFixed(1)} ${moneyUnit}`}
                  />
                </div>
              ) : (
                <EmptyChartState height={220} label={lang === "uz" ? "So'nggi kunlarda tushum yo'q" : "За последние дни доходов пока нет"} />
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4 lg:h-full lg:justify-between">
            <StatRow
              tone="blue"
              icon={LeafStudentsIcon}
              value={`${activeStudents}`}
              label={t("director.activeStudents")}
            />
            <StatRow
              tone={monthly.profit >= 0 ? "violet" : "red"}
              icon={LeafProfitIcon}
              value={formatMoney(monthly.profit, lang)}
              label={t("director.profit")}
            />
            <StatRow
              tone="amber"
              icon={LeafDebtorsIcon}
              value={`${debtors}`}
              label={t("director.debtors")}
            />
          </div>
        </div>

        {/* ── Secondary content — pushed down, quieter weight than the hero ── */}
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
              {sectionDividerLabel}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="glass-surface p-6 lg:col-span-2">
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
                        <div className="text-xs text-muted-foreground">{tch.subject} · {tch.students} {lang === "ru" ? plural(tch.students, "ученик", "ученика", "учеников") : t("students.count")}</div>
                      </div>
                      <Badge className="bg-success/10 text-success hover:bg-success/15">{tch.attendance}%</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="glass-surface p-6">
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

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="glass-surface p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold">{t("director.byCourse")}</h3>
                <p className="text-xs text-muted-foreground">{moneyUnit}</p>
              </div>
              {courseRevenue.length === 0 ? (
                <EmptyChartState height={200} label={lang === "uz" ? "Kurslar bo'yicha daromad hali yo'q" : "Доходов по курсам пока нет"} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={courseRevenue} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={110} />
                    <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)} ${moneyUnit}`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="glass-surface p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold">{t("director.attendanceAvg")}</h3>
              </div>
              {attendance.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
              ) : (
                <DonutWithLegend
                  glow
                  size={128}
                  centerValue={`${attendancePct}%`}
                  centerLabel={t("director.attendanceAvg")}
                  segments={[
                    { key: "present", label: t("att.present"), value: attendanceBreakdown.present, color: "#1f6e50" },
                    { key: "late", label: t("att.late"), value: attendanceBreakdown.late, color: "#e8a83c" },
                    { key: "absent", label: t("att.absent"), value: attendanceBreakdown.absent, color: "#ef5a5a" },
                    { key: "excused", label: t("att.excused"), value: attendanceBreakdown.excused, color: "#7b8f86" },
                  ]}
                />
              )}
            </Card>

            <div className="flex flex-col gap-4">
              <QuickLink to="/director/branches" icon={Building2} label={t("nav.branches")} hint={`${branches.length}`} />
              <QuickLink to="/director/staff" icon={Award} label={t("nav.staff")} hint={`${staff.length}`} />
              <QuickLink to="/director/analytics" icon={BookOpen} label={t("director.activeGroups")} hint={`${activeGroups}`} />
            </div>
          </div>
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

function EmptyChartState({ label, height = 260 }: { label: string; height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center"
      style={{ height }}
    >
      <AlertCircle className="size-8 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium text-foreground">{label}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, hint }: { to: string; icon: typeof Building2; label: string; hint: string }) {
  return (
    <Link to={to} className="group glass-surface flex items-center gap-3 rounded-xl p-4 transition-all hover:border-primary/40">
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
