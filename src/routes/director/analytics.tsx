import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, BookOpen, Layers, Wallet, AlertCircle, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, PieChart, Pie, Cell, Legend as ChartLegend,
} from "recharts";
import { PageHeader } from "@/components/edu/page-header";
import { StatCard } from "@/components/edu/stat-card";
import { Card } from "@/components/ui/card";
import { useData } from "@/lib/data/store";
import { attendancePercentage } from "@/lib/data/metrics";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/director/analytics")({ component: AnalyticsPage });

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function AnalyticsPage() {
  const { t, lang } = useI18n();
  const { students, groups, courses, branches, payments, attendance, staff, isLoading } = useData();

  // Monthly revenue for last 6 months
  const monthly = useMemo(() => {
    const months: { label: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inMonth = payments.filter((p) => {
        const pt = new Date(p.date).getTime();
        return pt >= d.getTime() && pt < next.getTime();
      });
      const income = inMonth.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0) / 1_000_000;
      const expense = inMonth.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0) / 1_000_000;
      months.push({ label: `${d.getMonth() + 1}/${d.getFullYear() % 100}`, income, expense });
    }
    return months;
  }, [payments]);

  // Students by status
  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => map.set(s.status, (map.get(s.status) ?? 0) + 1));
    return Array.from(map.entries()).map(([k, v]) => ({ name: t(`status.${k}`), value: v }));
  }, [students, t]);

  // Revenue by branch
  const byBranch = useMemo(() => {
    return branches.map((b) => {
      const income = payments
        .filter((p) => p.branchId === b.id && p.direction === "in")
        .reduce((s, p) => s + p.amount, 0);
      return { name: b.name, value: Math.round(income / 1_000_000) };
    });
  }, [branches, payments]);

  // Course occupancy
  const courseOccupancy = useMemo(() => {
    return courses.map((c) => {
      const cGroups = groups.filter((g) => g.courseId === c.id);
      const filled = cGroups.reduce((s, g) => s + g.studentIds.length, 0);
      const cap = cGroups.reduce((s, g) => s + g.capacity, 0);
      return { name: c.name, value: cap > 0 ? Math.round((filled / cap) * 100) : 0 };
    });
  }, [courses, groups]);

  const totalRevenue = payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const totalExpense = payments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const overdueAmount = students.filter((s) => s.status === "debtor").reduce((s, st) => s + Math.abs(st.balance), 0);
  const attPct = attendancePercentage(attendance);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("nav.analytics")} description={t("director.subtitle")} />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t("director.activeStudents")} value={`${students.length}`} icon={Users} tone="primary" />
          <StatCard label={t("director.activeGroups")} value={`${groups.length}`} icon={Layers} tone="info" />
          <StatCard label={t("director.monthlyRevenue")} value={formatMoney(totalRevenue, lang)} icon={Wallet} tone="success" />
          <StatCard label={t("director.attendanceAvg")} value={`${attPct}%`} icon={TrendingUp} tone="info" />
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4">
            <h3 className="text-base font-semibold">{t("director.monthlyRevenue")} / {t("director.monthlyExpense")}</h3>
            <p className="text-xs text-muted-foreground">6 oy · mln UZS</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <ChartLegend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="income" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} name={t("director.monthlyRevenue")} />
              <Line type="monotone" dataKey="expense" stroke="var(--chart-3)" strokeWidth={2.5} dot={{ r: 3 }} name={t("director.monthlyExpense")} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("director.byBranch")}</h3>
              <p className="text-xs text-muted-foreground">mln UZS</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byBranch}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("students.col.status")}</h3>
              <p className="text-xs text-muted-foreground">{students.length}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={3}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <ChartLegend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4">
            <h3 className="text-base font-semibold">{t("director.byCourse")} — {t("groups.field.capacity")}</h3>
            <p className="text-xs text-muted-foreground">%</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={courseOccupancy} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={140} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <SmallStat icon={BookOpen} label={t("nav.staff")} value={`${staff.length}`} />
          <SmallStat icon={AlertCircle} label={lang === "uz" ? "Muddati o'tgan" : "Просрочено"} value={formatMoney(overdueAmount, lang)} tone="text-destructive" />
          <SmallStat icon={Wallet} label={t("director.profit")} value={formatMoney(totalRevenue - totalExpense, lang)} tone={totalRevenue - totalExpense >= 0 ? "text-success" : "text-destructive"} />
        </div>
      </div>
    </>
  );
}

function SmallStat({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone?: string }) {
  return (
    <Card className="flex items-center gap-3 p-4 shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
      </div>
    </Card>
  );
}
