import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Users, BookOpen, DollarSign, TrendingUp, AlertTriangle, Award, CheckCircle2 } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { analyticsApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export function GroupReportSheet({ groupId, onClose }: { groupId: string | null; onClose: () => void }) {
  const { lang } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    setData(null);
    const now = new Date();
    const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    analyticsApi.groupReport(groupId, { date_from: dateFrom, date_to: dateTo })
      .then((res) => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [groupId]);

  const g = data?.group;
  const kpi = data?.kpi;

  return (
    <Sheet open={!!groupId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col overflow-hidden">
        {loading && (
          <div className="p-6 space-y-4">
            <div className="h-8 w-64 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
            <div className="grid grid-cols-4 gap-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        )}
        {!loading && data && (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="p-6 pb-4 border-b">
              <h2 className="text-xl font-semibold">{g?.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {g?.teacher_name} · {g?.room_name} · {g?.course_name}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className="bg-emerald-500/15 text-emerald-600 border-none">
                  {g?.status === "active" ? (lang === "uz" ? "Faol" : "Активна") : g?.status}
                </Badge>
                <Badge variant="outline">{formatMoney(g?.monthly_price, lang)}/{lang === "uz" ? "oy" : "мес"}</Badge>
                <Badge variant="outline">{kpi?.students_count}/{g?.capacity} {lang === "uz" ? "o'rin" : "мест"}</Badge>
              </div>

              {/* KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <KpiMini icon={Users} color="text-[#0077b6]" bg="bg-[#e0f2fe]" label={lang === "uz" ? "O'quvchilar" : "Студентов"} value={String(kpi?.students_count)} />
                <KpiMini icon={TrendingUp} color="text-emerald-500" bg="bg-emerald-500/10" label={lang === "uz" ? "Davomat" : "Посещаемость"} value={`${kpi?.attendance_rate}%`} />
                <KpiMini icon={BookOpen} color="text-orange-500" bg="bg-orange-500/10" label={lang === "uz" ? "Darslar" : "Уроки"} value={`${kpi?.conducted_lessons}/${kpi?.total_lessons}`} />
                <KpiMini icon={Award} color="text-rose-500" bg="bg-rose-500/10" label={lang === "uz" ? "O'rtacha baho" : "Ср. балл"} value={kpi?.avg_grade ? String(kpi.avg_grade) : "—"} />
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Attendance Chart */}
              {data.monthly_attendance?.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-sm font-medium mb-3">{lang === "uz" ? "Davomat tarixi" : "История посещаемости"}</h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={data.monthly_attendance} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
                      <Bar dataKey="rate" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Debtors */}
              <Card className="p-4">
                <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {lang === "uz" ? "Qarzdorlar" : "Должники"}
                  {data.debtors.length > 0 && <Badge variant="destructive" className="text-[10px]">{data.debtors.length}</Badge>}
                </h3>
                {data.debtors.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm py-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {lang === "uz" ? "Barcha o'quvchilar to'lagan" : "Все оплатили"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.debtors.map((d: any) => (
                      <div key={d.student_id} className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5">
                        <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{d.student_name.charAt(0)}</AvatarFallback></Avatar>
                        <span className="text-sm flex-1">{d.student_name}</span>
                        <span className="text-sm font-medium text-destructive">{formatMoney(d.balance, lang)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Students */}
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-3">{lang === "uz" ? "O'quvchilar" : "Студенты"}</h3>
                <div className="space-y-2">
                  {data.students.map((s: any) => (
                    <div key={s.student_id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{s.student_name.charAt(0)}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.student_name}</div>
                        <div className="text-xs text-muted-foreground">{s.phone}</div>
                      </div>
                      <div className="text-xs text-center">
                        <div className={s.attendance_rate >= 80 ? "text-emerald-600 font-medium" : s.attendance_rate >= 60 ? "text-amber-600 font-medium" : "text-destructive font-medium"}>{s.attendance_rate}%</div>
                      </div>
                      <div className={`text-xs font-medium ${s.balance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {formatMoney(s.balance, lang)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Finance Summary */}
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-3">{lang === "uz" ? "Moliya" : "Финансы"}</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">{lang === "uz" ? "Tushum" : "Доход"}</div>
                    <div className="text-sm font-semibold text-emerald-600 mt-1">{formatMoney(data.finance.income, lang)}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">{lang === "uz" ? "Yechildi" : "Списано"}</div>
                    <div className="text-sm font-semibold mt-1">{formatMoney(data.finance.charges, lang)}</div>
                  </div>
                  <div className="bg-destructive/10 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">{lang === "uz" ? "Qarz" : "Долг"}</div>
                    <div className="text-sm font-semibold text-destructive mt-1">{formatMoney(Math.abs(data.finance.total_debt), lang)}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KpiMini({ icon: Icon, color, bg, label, value }: { icon: any; color: string; bg: string; label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} mb-2`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
