import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, DollarSign, Users, Wallet, MinusCircle } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { analyticsApi } from "@/lib/api";
import { startOfMonth, endOfMonth, format } from "date-fns";

export const Route = createFileRoute("/teacher/finance")({
  component: TeacherFinancePage,
});

function TeacherFinancePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  useEffect(() => {
    loadData();
  }, [dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await analyticsApi.teacherSalary({ date_from: dateFrom, date_to: dateTo });
      setData(response);
    } catch (err) {
      console.error(err);
      toast.error("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: string | number) => {
    return new Intl.NumberFormat("ru-RU").format(Number(amount)) + " UZS";
  };

  return (
    <>
      <PageHeader 
        title="Mening daromadim" 
        description="Guruhlar bo'yicha hisoblangan daromad va jarimalar statistikasi" 
      />

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Date Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">Davr:</span>
            </div>
            <input 
              type="date" 
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm"
            />
            <span className="text-muted-foreground">-</span>
            <input 
              type="date" 
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm"
            />
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !data ? (
          <div className="text-center py-10 text-muted-foreground">Ma'lumot topilmadi</div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-green-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Umumiy hisoblangan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-5 text-green-500" />
                    <span className="text-2xl font-bold">{formatMoney(data.calculated_salary)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">O'quvchilar to'lovidan {data.salary_percent}%</p>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/60 bg-gradient-to-br from-red-500/10 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Jarimalar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <MinusCircle className="size-5 text-red-500" />
                    <span className="text-2xl font-bold">{formatMoney(data.penalties_total)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/60 bg-primary/5 border-primary/20 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-primary">Sof daromad (Qo'lga tegadigan)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Wallet className="size-6 text-primary" />
                    <span className="text-3xl font-bold text-primary">{formatMoney(data.net_salary)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Groups Breakdown */}
            <h3 className="text-lg font-semibold mt-8 mb-4 flex items-center gap-2">
              <Users className="size-5 text-primary" /> Guruhlar bo'yicha daromad
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.groups?.length > 0 ? (
                data.groups.map((group: any) => (
                  <Card key={group.group_id} className="shadow-sm border-border/60 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center">
                      <h4 className="font-semibold">{group.group_name}</h4>
                      <span className="text-primary font-bold">{formatMoney(Number(group.group_total) * (Number(data.salary_percent)/100))}</span>
                    </div>
                    <CardContent className="p-0">
                      <div className="max-h-[250px] overflow-y-auto p-4 space-y-3">
                        {group.students?.map((student: any) => (
                          <div key={student.student_id} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                            <span>{student.full_name}</span>
                            <span className="text-muted-foreground">{formatMoney(student.payments_sum)} to'lov</span>
                          </div>
                        ))}
                        {(!group.students || group.students.length === 0) && (
                          <div className="text-center text-xs text-muted-foreground py-2">
                            Ushbu davrda to'lovlar yo'q
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full bg-muted/20 rounded-lg p-8 text-center text-muted-foreground">
                  Tanlangan davr uchun guruhlardan tushumlar mavjud emas
                </div>
              )}
            </div>

            {/* Penalties List */}
            {data.penalties?.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mt-8 mb-4 flex items-center gap-2 text-red-500">
                  <MinusCircle className="size-5" /> Jarimalar tafsiloti
                </h3>
                <Card className="shadow-sm border-red-500/20">
                  <div className="divide-y divide-border/50">
                    {data.penalties.map((penalty: any) => (
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
    </>
  );
}
