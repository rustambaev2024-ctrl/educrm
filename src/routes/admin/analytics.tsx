import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, Wallet, CalendarCheck, Layers } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend as ChartLegend } from "recharts";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { useData } from "@/lib/data/store";
import { attendancePercentage } from "@/lib/data/metrics";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/admin/analytics")({ component: AdminAnalytics });

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function AdminAnalytics() {
  const { t, lang } = useI18n();
  const { students, groups, lessons, payments, attendance, courses, isLoading } = useData();

  const totalIncome = payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const completedLessons = lessons.filter((l) => l.status === "completed").length;
  const attPct = attendancePercentage(attendance);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => map.set(s.status, (map.get(s.status) ?? 0) + 1));
    return Array.from(map.entries()).map(([k, v]) => ({ name: t(`status.${k}`), value: v }));
  }, [students, t]);

  const last14 = useMemo(() => {
    const arr: { day: string; income: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const inDay = payments.filter((p) => {
        const pt = new Date(p.date).getTime();
        return pt >= d.getTime() && pt < next.getTime() && p.direction === "in";
      });
      arr.push({ day: `${d.getDate()}.${d.getMonth() + 1}`, income: inDay.reduce((s, p) => s + p.amount, 0) / 1_000_000 });
    }
    return arr;
  }, [payments]);

  const byCourse = useMemo(() => {
    return courses.map((c) => {
      const cGroups = groups.filter((g) => g.courseId === c.id);
      const studentSet = new Set<string>();
      cGroups.forEach((g) => g.studentIds.forEach((sid) => studentSet.add(sid)));
      return { name: c.name, value: studentSet.size };
    });
  }, [courses, groups]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell title={t("nav.analytics")} subtitle={t("admin.subtitle")}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("director.activeStudents")} value={`${students.length}`} icon={Users} iconColor="blue" subtitle={lang === "uz" ? "Faol va muzlatilganlar" : "Активные и замороженные"} />
          <KpiCard label={t("admin.activeGroups")} value={`${groups.length}`} icon={Layers} iconColor="violet" subtitle={lang === "uz" ? "Faol o'quv guruhlari" : "Активные учебные группы"} />
          <KpiCard label={t("director.attendanceAvg")} value={`${attPct}%`} icon={CalendarCheck} iconColor="green" subtitle={lang === "uz" ? "O'rtacha joriy oy" : "Среднее за текущий месяц"} />
          <KpiCard label={t("director.monthlyRevenue")} value={formatMoney(totalIncome, lang)} icon={Wallet} iconColor="amber" subtitle={lang === "uz" ? "Joriy oy to'lovlari" : "Платежи за текущий месяц"} />
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4">
            <h3 className="text-base font-semibold">{t("director.monthlyRevenue")}</h3>
            <p className="text-xs text-muted-foreground">14 kun · mln UZS</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={last14}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value: any) => [`${Number(value).toFixed(1)} mln`, t("finance.kpi.income")]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="income" name={t("finance.kpi.income")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("students.col.status")}</h3>
              <p className="text-xs text-muted-foreground">{lang === "uz" ? "O'quvchilar holati" : "Статус студентов"} · {students.length}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={3}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <ChartLegend wrapperStyle={{ fontSize: 11 }} formatter={(value: string, entry: any) => `${value}: ${entry?.payload?.value ?? 0}`} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("director.byCourse")}</h3>
              <p className="text-xs text-muted-foreground">{lang === "uz" ? "Guruhlardagi o'quvchilar" : "Студенты по курсам"}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCourse} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <Tooltip formatter={(value: any) => [`${value} ta`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card className="p-5 shadow-elegant">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <CalendarCheck className="size-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lstatus.completed")}</div>
              <div className="text-2xl font-bold tabular-nums">{completedLessons}</div>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
