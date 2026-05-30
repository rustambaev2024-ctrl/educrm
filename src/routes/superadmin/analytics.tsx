import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Building2, Users, Briefcase, Activity, TrendingUp, CalendarClock } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/superadmin/analytics")({ component: SaAnalytics });

function SaAnalytics() {
  const { t, lang } = useI18n();
  const { institutions, isLoading } = useData();

  const active = institutions.filter((i) => i.status === "active");
  const mrr = active.reduce((s, i) => s + i.monthlyRevenue, 0);
  const totalStudents = active.reduce((s, i) => s + i.studentsCount, 0);
  const totalStaff = active.reduce((s, i) => s + i.staffCount, 0);
  const expiringSoon = institutions.filter((i) => {
    const days = (new Date(i.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30 && i.status === "active";
  }).length;

  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    active.forEach((i) => map.set(i.city, (map.get(i.city) ?? 0) + i.studentsCount));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [active]);

  const topInst = useMemo(
    () => [...active].sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).slice(0, 8).map((i) => ({ name: i.name, value: Math.round(i.monthlyRevenue / 1_000_000) })),
    [active],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell title={t("sa.analytics.title")} subtitle={t("sa.analytics.subtitle")}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("sa.kpi.activeInst")} value={active.length} icon={Building2} iconColor="blue" />
          <KpiCard label={t("sa.kpi.totalStudents")} value={totalStudents.toLocaleString("ru-RU")} icon={Users} iconColor="green" />
          <KpiCard label={t("sa.kpi.totalStaff")} value={totalStaff} icon={Briefcase} iconColor="violet" />
          <KpiCard label={t("sa.kpi.expiring")} value={expiringSoon} icon={CalendarClock} iconColor="amber" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 shadow-elegant">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <Activity className="size-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("sa.kpi.mrr")}</div>
                <div className="text-2xl font-bold tabular-nums">{formatMoney(mrr, lang)}</div>
              </div>
            </div>
          </Card>
          <Card className="p-5 shadow-elegant">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-success/15 text-success">
                <TrendingUp className="size-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("sa.kpi.arr")}</div>
                <div className="text-2xl font-bold tabular-nums">{formatMoney(mrr * 12, lang)}</div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4">
            <h3 className="text-base font-semibold">{t("sa.kpi.mrr")} — top muassasalar</h3>
            <p className="text-xs text-muted-foreground">mln UZS</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topInst} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={150} />
              <Tooltip formatter={(value: any) => [`${value} mln`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid gap-6">
          <Card className="p-6 shadow-elegant">
            <div className="mb-4">
              <h3 className="text-base font-semibold">{t("sa.byCity")}</h3>
              <p className="text-xs text-muted-foreground">{t("sa.kpi.totalStudents")}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => [`${value} ta`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
