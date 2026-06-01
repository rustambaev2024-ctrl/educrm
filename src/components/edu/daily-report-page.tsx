import { useState, useEffect } from "react";
import { Calendar, Download, FileText, AlertTriangle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Minus, DollarSign, BookOpen, Users, UserCheck, Target } from "lucide-react";
import * as XLSX from "xlsx";
import { analyticsApi } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import { useI18n, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function getLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface DailyReportData {
  date: string;
  yesterday: string;
  finance: {
    income_today: string;
    income_yesterday: string;
    income_delta: string;
    charges_today: string;
    new_debtors_today: number;
    total_debt: string;
    top_payments: Array<{ student_name: string; amount: string; method: string; time: string }>;
    payments_count: number;
  };
  lessons: {
    total: number;
    conducted: number;
    cancelled: number;
    conducted_yesterday: number;
    no_attendance_count: number;
    no_attendance_list: Array<{ group_name: string; teacher_name: string; time: string }>;
    cancelled_list: Array<{ group_name: string; teacher_name: string; time: string; reason: string }>;
  };
  students: {
    total: number;
    present: number;
    absent: number;
    late: number;
    attendance_rate: number;
    attendance_rate_yesterday: number;
    absent_list: Array<{ student_name: string; group_name: string; teacher_name: string }>;
  };
  teachers: {
    total: number;
    present: number;
    late: number;
    absent: number;
    no_data: number;
    list: Array<{ teacher_name: string; status: string; check_in_time: string | null; late_minutes: number | null }>;
  };
  leads: {
    today: number;
    yesterday: number;
    delta: number;
    list: Array<{ name: string; source: string; status: string; time: string }>;
  };
}

const pageLabels = (lang: Lang) => ({
  title: lang === "uz" ? "Kunlik hisobot" : "Ежедневный отчёт",
  date: lang === "uz" ? "Sana" : "Дата",
  exportPdf: "PDF",
  exportExcel: "Excel",
  kpi: {
    income: lang === "uz" ? "Tushum" : "Доход",
    attendance: lang === "uz" ? "O'quvchi davomati" : "Посещаемость учеников",
    lessons: lang === "uz" ? "Darslar" : "Уроки",
    leads: lang === "uz" ? "Yangi lidlar" : "Новые лиды",
    debtors: lang === "uz" ? "Yangi qarzdorlar" : "Новые должники",
  },
  finance: {
    title: lang === "uz" ? "Moliya" : "Финансы",
    income: lang === "uz" ? "Tushum" : "Доход",
    charges: lang === "uz" ? "Hisobdan yechish" : "Списания",
    topPayments: lang === "uz" ? "Eng katta to'lovlar" : "Крупнейшие платежи",
    paymentsCount: lang === "uz" ? "To'lovlar soni" : "Количество платежей",
    studentName: lang === "uz" ? "O'quvchi" : "Ученик",
    amount: lang === "uz" ? "Summa" : "Сумма",
    method: lang === "uz" ? "Usul" : "Способ",
    time: lang === "uz" ? "Vaqt" : "Время",
    newDebtors: lang === "uz" ? "Yangi qarzdorlar" : "Новые должники",
    totalDebt: lang === "uz" ? "Jami qarz" : "Общий долг",
  },
  lessons: {
    title: lang === "uz" ? "Darslar" : "Уроки",
    total: lang === "uz" ? "Jami" : "Всего",
    conducted: lang === "uz" ? "O'tkazildi" : "Проведено",
    cancelled: lang === "uz" ? "Bekor qilindi" : "Отменено",
    noAttendance: lang === "uz" ? "Davomat belgilanmagan" : "Посещаемость не отмечена",
    noAttendanceWarning: (n: number) =>
      lang === "uz"
        ? `⚠️ ${n} ta darsda davomat belgilanmagan — to'lov yo'qotishi!`
        : `⚠️ В ${n} уроках не отмечена посещаемость — потеря оплаты!`,
    group: lang === "uz" ? "Guruh" : "Группа",
    teacher: lang === "uz" ? "O'qituvchi" : "Учитель",
    reason: lang === "uz" ? "Sabab" : "Причина",
  },
  students: {
    title: lang === "uz" ? "O'quvchilar davomati" : "Посещаемость учеников",
    present: lang === "uz" ? "Kelgan" : "Присутствуют",
    absent: lang === "uz" ? "Kelmagan" : "Отсутствуют",
    late: lang === "uz" ? "Kechikkan" : "Опоздали",
    rate: lang === "uz" ? "Davomat" : "Посещаемость",
    studentName: lang === "uz" ? "O'quvchi" : "Ученик",
    group: lang === "uz" ? "Guruh" : "Группа",
    teacher: lang === "uz" ? "O'qituvchi" : "Учитель",
  },
  teachers: {
    title: lang === "uz" ? "O'qituvchilar" : "Учителя",
    present: lang === "uz" ? "Kelgan" : "Присутствуют",
    late: lang === "uz" ? "Kechikkan" : "Опоздали",
    absent: lang === "uz" ? "Kelmagan" : "Отсутствуют",
    noData: lang === "uz" ? "Ma'lumot yo'q" : "Нет данных",
    teacherName: lang === "uz" ? "O'qituvchi" : "Учитель",
    status: lang === "uz" ? "Holat" : "Статус",
    checkIn: lang === "uz" ? "Kirish" : "Вход",
  },
  leads: {
    title: lang === "uz" ? "Yangi lidlar" : "Новые лиды",
    name: lang === "uz" ? "Ism" : "Имя",
    source: lang === "uz" ? "Manba" : "Источник",
    status: lang === "uz" ? "Holat" : "Статус",
    time: lang === "uz" ? "Vaqt" : "Время",
  },
  status: {
    present: lang === "uz" ? "Kelgan" : "Присутствует",
    late: lang === "uz" ? "Kechikkan" : "Опоздал",
    absent: lang === "uz" ? "Kelmagan" : "Отсутствует",
    new: lang === "uz" ? "Yangi" : "Новый",
    contacted: lang === "uz" ? "Aloqa qilingan" : "На связи",
    converted: lang === "uz" ? "Aylantirilgan" : "Конвертирован",
    lost: lang === "uz" ? "Yo'qotilgan" : "Потерян",
  },
  yesterday: lang === "uz" ? "Kecha:" : "Вчера:",
  noCancelled: lang === "uz" ? "Bekor qilingan darslar yo'q" : "Отменённых уроков нет",
  noLeads: lang === "uz" ? "Yangi lidlar yo'q" : "Новых лидов нет",
  errorMsg: lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка",
});

export function DailyReportPage() {
  const { lang } = useI18n();
  const labels = pageLabels(lang as Lang);
  const [date, setDate] = useState<string>(getLocalDate());
  const [data, setData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoAttendance, setShowNoAttendance] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [date]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsApi.dailyReport({ date });
      setData(result as DailyReportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const financeData = [
      [lang === "uz" ? "Sana" : "Дата", data.date],
      [lang === "uz" ? "Tushum (bugun)" : "Доход (сегодня)", data.finance.income_today],
      [lang === "uz" ? "Tushum (kecha)" : "Доход (вчера)", data.finance.income_yesterday],
      [lang === "uz" ? "Farq" : "Разница", data.finance.income_delta],
      [lang === "uz" ? "Hisobdan yechish" : "Списания", data.finance.charges_today],
      [lang === "uz" ? "To'lovlar soni" : "Количество платежей", data.finance.payments_count],
      [lang === "uz" ? "Yangi qarzdorlar" : "Новые должники", data.finance.new_debtors_today],
      [lang === "uz" ? "Jami qarz" : "Общий долг", data.finance.total_debt],
      [],
      [lang === "uz" ? "Eng katta to'lovlar" : "Крупнейшие платежи"],
      [lang === "uz" ? "O'quvchi" : "Ученик", lang === "uz" ? "Summa" : "Сумма", lang === "uz" ? "Usul" : "Способ", lang === "uz" ? "Vaqt" : "Время"],
      ...data.finance.top_payments.map((p) => [p.student_name, p.amount, p.method, p.time]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(financeData), "Moliya");

    const lessonsData = [
      [lang === "uz" ? "Jami darslar" : "Всего уроков", data.lessons.total],
      [lang === "uz" ? "O'tkazildi" : "Проведено", data.lessons.conducted],
      [lang === "uz" ? "Bekor qilindi" : "Отменено", data.lessons.cancelled],
      [lang === "uz" ? "Davomat belgilanmagan" : "Посещаемость не отмечена", data.lessons.no_attendance_count],
      [],
      [lang === "uz" ? "Bekor qilingan darslar" : "Отменённые уроки"],
      [lang === "uz" ? "Guruh" : "Группа", lang === "uz" ? "O'qituvchi" : "Учитель", lang === "uz" ? "Vaqt" : "Время", lang === "uz" ? "Sabab" : "Причина"],
      ...data.lessons.cancelled_list.map((l) => [l.group_name, l.teacher_name, l.time, l.reason]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lessonsData), "Darslar");

    const attendanceData = [
      [lang === "uz" ? "Jami o'quvchilar" : "Всего учеников", data.students.total],
      [lang === "uz" ? "Kelgan" : "Присутствуют", data.students.present],
      [lang === "uz" ? "Kelmagan" : "Отсутствуют", data.students.absent],
      [lang === "uz" ? "Kechikkan" : "Опоздали", data.students.late],
      [lang === "uz" ? "Davomat foizi" : "Процент посещаемости", `${data.students.attendance_rate}%`],
      [],
      [lang === "uz" ? "Kelmagan o'quvchilar" : "Отсутствующие ученики"],
      [lang === "uz" ? "O'quvchi" : "Ученик", lang === "uz" ? "Guruh" : "Группа", lang === "uz" ? "O'qituvchi" : "Учитель"],
      ...data.students.absent_list.map((a) => [a.student_name, a.group_name, a.teacher_name]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attendanceData), "Davomat");

    const teachersData = [
      [lang === "uz" ? "Jami o'qituvchilar" : "Всего учителей", data.teachers.total],
      [lang === "uz" ? "Kelgan" : "Присутствуют", data.teachers.present],
      [lang === "uz" ? "Kechikkan" : "Опоздали", data.teachers.late],
      [lang === "uz" ? "Kelmagan" : "Отсутствуют", data.teachers.absent],
      [lang === "uz" ? "Ma'lumot yo'q" : "Нет данных", data.teachers.no_data],
      [],
      [lang === "uz" ? "O'qituvchilar ro'yxati" : "Список учителей"],
      [lang === "uz" ? "O'qituvchi" : "Учитель", lang === "uz" ? "Holat" : "Статус", lang === "uz" ? "Kirish" : "Вход", lang === "uz" ? "Kechikish (daqiqa)" : "Опоздание (мин)"],
      ...data.teachers.list.map((t) => [t.teacher_name, t.status, t.check_in_time || "-", t.late_minutes || "-"]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teachersData), "O'qituvchilar");

    const leadsData = [
      [lang === "uz" ? "Yangi lidlar (bugun)" : "Новые лиды (сегодня)", data.leads.today],
      [lang === "uz" ? "Yangi lidlar (kecha)" : "Новые лиды (вчера)", data.leads.yesterday],
      [lang === "uz" ? "Farq" : "Разница", data.leads.delta],
      [],
      [lang === "uz" ? "Yangi lidlar ro'yxati" : "Список новых лидов"],
      [lang === "uz" ? "Ism" : "Имя", lang === "uz" ? "Manba" : "Источник", lang === "uz" ? "Holat" : "Статус", lang === "uz" ? "Vaqt" : "Время"],
      ...data.leads.list.map((l) => [l.name, l.source, l.status, l.time]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leadsData), "Lidlar");

    XLSX.writeFile(wb, `daily-report-${data.date}.xlsx`);
  };

  const getDeltaIcon = (deltaStr: string) => {
    const delta = parseFloat(deltaStr);
    if (delta > 0) return <ArrowUp className="h-4 w-4 text-emerald-500" />;
    if (delta < 0) return <ArrowDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    if (status === "present") return "bg-emerald-500";
    if (status === "late") return "bg-amber-500";
    if (status === "absent") return "bg-destructive";
    return "bg-gray-400";
  };

  const getStatusLabel = (status: string) =>
    labels.status[status as keyof typeof labels.status] || status;

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-lg bg-muted animate-pulse" />
            <div className="h-9 w-20 rounded-lg bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{error || labels.errorMsg}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print:p-0 print:m-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{labels.title}</h1>
          <p className="text-muted-foreground">{formatDate(data.date, lang as Lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <FileText className="h-4 w-4" />
            {labels.exportPdf}
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <Download className="h-4 w-4" />
            {labels.exportExcel}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.income}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(parseFloat(data.finance.income_today), lang as Lang)}</div>
            <div className="flex items-center gap-1 text-sm">
              {getDeltaIcon(data.finance.income_delta)}
              <span className={parseFloat(data.finance.income_delta) >= 0 ? "text-emerald-500" : "text-destructive"}>
                {formatMoney(Math.abs(parseFloat(data.finance.income_delta)), lang as Lang)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.attendance}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.students.attendance_rate}%</div>
            <div className="text-sm text-muted-foreground">
              {labels.yesterday} {data.students.attendance_rate_yesterday}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.lessons}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.lessons.conducted} / {data.lessons.total}
            </div>
            <div className="text-sm text-muted-foreground">
              {data.lessons.cancelled} {labels.lessons.cancelled.toLowerCase()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.leads}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.leads.today}</div>
            <div className="flex items-center gap-1 text-sm">
              {data.leads.delta > 0 ? (
                <ArrowUp className="h-4 w-4 text-emerald-500" />
              ) : data.leads.delta < 0 ? (
                <ArrowDown className="h-4 w-4 text-destructive" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={data.leads.delta >= 0 ? "text-emerald-500" : "text-destructive"}>
                {Math.abs(data.leads.delta)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.debtors}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.finance.new_debtors_today}</div>
            <div className="text-sm text-muted-foreground">
              {labels.finance.totalDebt}: {formatMoney(parseFloat(data.finance.total_debt), lang as Lang)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning Alert */}
      {data.lessons.no_attendance_count > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <button
              className="flex items-center justify-between w-full cursor-pointer"
              onClick={() => setShowNoAttendance(!showNoAttendance)}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="font-medium text-amber-700">
                  {labels.lessons.noAttendanceWarning(data.lessons.no_attendance_count)}
                </span>
              </div>
              {showNoAttendance ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showNoAttendance && (
              <div className="mt-4 ml-7 space-y-2">
                {data.lessons.no_attendance_list.map((lesson, idx) => (
                  <div key={idx} className="text-sm text-amber-700">
                    <strong>{lesson.group_name}</strong> — {lesson.teacher_name} ({lesson.time})
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finance & Lessons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
              {labels.finance.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.finance.top_payments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{labels.finance.topPayments}</h4>
                <div className="space-y-2">
                  {data.finance.top_payments.map((payment, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-2 border-b">
                      <div className="flex-1">
                        <div className="font-medium">{payment.student_name}</div>
                        <div className="text-muted-foreground text-xs">
                          {payment.method} · {payment.time}
                        </div>
                      </div>
                      <div className="font-semibold text-emerald-600">
                        {formatMoney(parseFloat(payment.amount), lang as Lang)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-3 bg-emerald-500/10 rounded">
                <div className="text-sm text-muted-foreground">{labels.finance.income}</div>
                <div className="text-lg font-bold text-emerald-600">
                  {formatMoney(parseFloat(data.finance.income_today), lang as Lang)}
                </div>
              </div>
              <div className="p-3 bg-destructive/10 rounded">
                <div className="text-sm text-muted-foreground">{labels.finance.charges}</div>
                <div className="text-lg font-bold text-destructive">
                  {formatMoney(parseFloat(data.finance.charges_today), lang as Lang)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e0f2fe]">
                <BookOpen className="h-4 w-4 text-[#0077b6]" />
              </div>
              {labels.lessons.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm">{labels.lessons.conducted}: {data.lessons.conducted}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-sm">{labels.lessons.cancelled}: {data.lessons.cancelled}</span>
              </div>
            </div>
            {data.lessons.cancelled_list.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium mb-2 text-destructive">{labels.lessons.cancelled}</h4>
                <div className="space-y-2">
                  {data.lessons.cancelled_list.map((lesson, idx) => (
                    <div key={idx} className="text-sm py-2 border-b border-destructive/20">
                      <div className="font-medium">{lesson.group_name}</div>
                      <div className="text-muted-foreground text-xs">
                        {lesson.teacher_name} · {lesson.time}
                      </div>
                      {lesson.reason && (
                        <div className="text-destructive text-xs mt-1">{lesson.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                {labels.noCancelled}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Students Attendance & Teachers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                <Users className="h-4 w-4 text-violet-500" />
              </div>
              {labels.students.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{data.students.attendance_rate}%</span>
                <span className="text-muted-foreground">
                  {data.students.present} / {data.students.total}
                </span>
              </div>
              <Progress value={data.students.attendance_rate} className="h-3" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-emerald-500/10 rounded">
                <div className="text-2xl font-bold text-emerald-600">{data.students.present}</div>
                <div className="text-xs text-muted-foreground">{labels.students.present}</div>
              </div>
              <div className="text-center p-3 bg-destructive/10 rounded">
                <div className="text-2xl font-bold text-destructive">{data.students.absent}</div>
                <div className="text-xs text-muted-foreground">{labels.students.absent}</div>
              </div>
              <div className="text-center p-3 bg-amber-500/10 rounded">
                <div className="text-2xl font-bold text-amber-600">{data.students.late}</div>
                <div className="text-xs text-muted-foreground">{labels.students.late}</div>
              </div>
            </div>
            {data.students.absent_list.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-destructive">{labels.students.absent}</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.students.absent_list.map((student, idx) => (
                    <div key={idx} className="text-sm py-2 border-b">
                      <div className="font-medium">{student.student_name}</div>
                      <div className="text-muted-foreground text-xs">
                        {student.group_name} · {student.teacher_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15">
                <UserCheck className="h-4 w-4 text-orange-500" />
              </div>
              {labels.teachers.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 bg-emerald-500/10 rounded">
                <div className="font-bold text-emerald-600">{data.teachers.present}</div>
                <div className="text-xs text-muted-foreground">{labels.teachers.present}</div>
              </div>
              <div className="text-center p-2 bg-amber-500/10 rounded">
                <div className="font-bold text-amber-600">{data.teachers.late}</div>
                <div className="text-xs text-muted-foreground">{labels.teachers.late}</div>
              </div>
              <div className="text-center p-2 bg-destructive/10 rounded">
                <div className="font-bold text-destructive">{data.teachers.absent}</div>
                <div className="text-xs text-muted-foreground">{labels.teachers.absent}</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded">
                <div className="font-bold text-muted-foreground">{data.teachers.no_data}</div>
                <div className="text-xs text-muted-foreground">{labels.teachers.noData}</div>
              </div>
            </div>
            {data.teachers.list.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {data.teachers.list.map((teacher, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm py-2 border-b">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(teacher.status)}`} />
                    <div className="flex-1 font-medium">{teacher.teacher_name}</div>
                    <Badge
                      variant={teacher.status === "present" ? "default" : teacher.status === "late" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {getStatusLabel(teacher.status)}
                    </Badge>
                    {teacher.check_in_time && (
                      <span className="text-muted-foreground text-xs">{teacher.check_in_time}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15">
              <Target className="h-4 w-4 text-rose-500" />
            </div>
            {labels.leads.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.leads.list.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3">{labels.leads.name}</th>
                    <th className="text-left py-2 px-3">{labels.leads.source}</th>
                    <th className="text-left py-2 px-3">{labels.leads.status}</th>
                    <th className="text-left py-2 px-3">{labels.leads.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.list.map((lead, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 px-3 font-medium">{lead.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{lead.source}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">{getStatusLabel(lead.status)}</Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{lead.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">{labels.noLeads}</div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:m-0 { margin: 0 !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
