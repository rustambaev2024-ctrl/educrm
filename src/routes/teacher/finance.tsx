import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, DollarSign, Users, Wallet, MinusCircle } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { startOfMonth, endOfMonth, format } from "date-fns";

export const Route = createFileRoute("/teacher/finance")({
  component: TeacherFinancePage,
});

interface StudentRow {
  student_id: string;
  full_name: string;
  payments_sum: string;
}

interface GroupRow {
  group_id: string;
  group_name: string;
  students: StudentRow[];
  group_total: string;
}

interface PenaltyRow {
  id: string;
  amount: string;
  reason: string;
  penalty_date: string;
  comment: string;
}

interface SalaryData {
  groups: GroupRow[];
  total_student_payments: string;
  salary_percent: string;
  calculated_salary: string;
  penalties_total: string;
  penalty_debt: string;
  net_salary: string;
  total_paid: string;
  remaining_balance: string;
  penalties: PenaltyRow[];
}

function formatMoney(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("uz-UZ", { style: "currency", currency: "UZS", maximumFractionDigits: 0 }).format(num);
}

function TeacherFinancePage() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(today), "yyyy-MM-dd"));
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSalary = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.teacherSalary({ date_from: dateFrom, date_to: dateTo });
      setData(res as unknown as SalaryData);
    } catch (err) {
      console.error(err);
      toast.error(tr("Ma'lumot yuklashda xatolik yuz berdi", "Ошибка загрузки данных"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalary();
  }, [dateFrom, dateTo]);

  return (
    <PageShell
      title={tr("Mening daromadim", "Мой доход")}
      subtitle={tr("Guruhlar bo'yicha hisoblangan daromad va jarimalar statistikasi", "Статистика начисленного дохода и штрафов по группам")}
    >
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Date Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{tr("Davr:", "Период:")}</span>
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-background"
            />
            <span className="text-muted-foreground">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-background"
            />
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !data ? (
          <div className="text-center py-10 text-muted-foreground">{tr("Ma'lumot topilmadi", "Данные не найдены")}</div>
        ) : (
          <>
            {/* Penalty Debt Card */}
            {Number(data.penalty_debt) > 0 && (
              <Card className="border-orange-500 bg-orange-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-orange-500 text-sm">
                    {tr("Jarima qoldig'i (keyingi oyga o'tadi)", "Остаток штрафов (переходит на следующий месяц)")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-orange-500">
                    {formatMoney(data.penalty_debt)}
                  </p>
                  <p className="text-xs text-orange-500 mt-1">
                    {tr(
                      "Jarimalar daromaddan ko'p bo'lgani uchun qolgan qism keyingi hisob-kitobga o'tkaziladi",
                      "Штрафы превысили доход — остаток перенесён на следующий расчёт"
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-green-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{tr("Hisoblangan", "Начислено")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-5 text-green-500" />
                    <span className="text-xl font-bold">{formatMoney(data.calculated_salary)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{tr("O'quvchilar to'lovidan", "От оплат учеников")} {data.salary_percent}%</p>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-red-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{tr("Jarimalar", "Штрафы")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <MinusCircle className="size-5 text-red-500" />
                    <span className="text-xl font-bold">{formatMoney(data.penalties_total)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-primary/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-primary">{tr("Sof daromad", "Чистый доход")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Wallet className="size-5 text-primary" />
                    <span className="text-xl font-bold text-primary">{formatMoney(data.net_salary)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-emerald-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-500">{tr("To'langan", "Выплачено")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-5 text-emerald-500" />
                    <span className="text-xl font-bold text-emerald-500">{formatMoney(data.total_paid)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{tr("Kassadan berilgan", "Выдано из кассы")}</p>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-orange-500">{tr("Qoldiq", "Остаток")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Wallet className="size-5 text-orange-500" />
                    <span className="text-xl font-bold text-orange-500">{formatMoney(data.remaining_balance)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{tr("To'lanishi kerak", "К выплате")}</p>
                </CardContent>
              </Card>
            </div>

            {/* Groups Breakdown */}
            <h3 className="text-lg font-semibold mt-8 mb-4 flex items-center gap-2">
              <Users className="size-5 text-primary" /> {tr("Guruhlar bo'yicha daromad", "Доход по группам")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.groups?.length > 0 ? (
                data.groups.map((group) => (
                  <Card key={group.group_id} className="shadow-sm border-border/60 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center">
                      <h4 className="font-semibold">{group.group_name}</h4>
                      <span className="text-primary font-bold">{formatMoney(Number(group.group_total) * (Number(data.salary_percent) / 100))}</span>
                    </div>
                    <CardContent className="p-0">
                      <div className="max-h-[250px] overflow-y-auto p-4 space-y-3">
                        {group.students?.map((student) => (
                          <div key={student.student_id} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                            <span>{student.full_name}</span>
                            <span className="text-muted-foreground">{formatMoney(student.payments_sum)} {tr("to'lov", "оплата")}</span>
                          </div>
                        ))}
                        {(!group.students || group.students.length === 0) && (
                          <div className="text-center text-xs text-muted-foreground py-2">
                            {tr("Ushbu davrda to'lovlar yo'q", "Нет данных за этот период")}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full bg-muted/20 rounded-lg p-8 text-center text-muted-foreground">
                  {tr("Tanlangan davr uchun guruhlardan tushumlar mavjud emas", "За выбранный период поступлений от групп нет")}
                </div>
              )}
            </div>

            {/* Penalties List */}
            {data.penalties?.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mt-8 mb-4 flex items-center gap-2 text-red-500">
                  <MinusCircle className="size-5" /> {tr("Jarimalar tafsiloti", "Детализация штрафов")}
                </h3>
                <Card className="shadow-sm border-red-500/20">
                  <div className="divide-y divide-border/50">
                    {data.penalties.map((penalty) => (
                      <div key={penalty.id} className="p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div>
                          <div className="font-medium">{penalty.reason}</div>
                          {penalty.comment && <div className="text-sm text-muted-foreground">{penalty.comment}</div>}
                          <div className="text-xs text-muted-foreground mt-1">{penalty.penalty_date}</div>
                        </div>
                        <div className="text-red-500 font-bold whitespace-nowrap">
                          - {formatMoney(penalty.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
