import { useState, useEffect } from "react";
import { Calendar, Download, FileText, AlertTriangle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Minus, DollarSign, BookOpen, Users, UserCheck, Target, TrendingUp, GraduationCap, UserPlus, AlertCircle } from "lucide-react";
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
  title: lang === "uz" ? "Kunlik hisobot" : "Р•Р¶РµРґРЅРµРІРЅС‹Р№ РѕС‚С‡С‘С‚",
  date: lang === "uz" ? "Sana" : "Р”Р°С‚Р°",
  exportPdf: lang === "uz" ? "PDF" : "PDF",
  exportExcel: lang === "uz" ? "Excel" : "Excel",
  kpi: {
    income: lang === "uz" ? "Tushum" : "Р”РѕС…РѕРґ",
    attendance: lang === "uz" ? "O'quvchi davomati" : "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ СѓС‡РµРЅРёРєРѕРІ",
    lessons: lang === "uz" ? "Darslar" : "РЈСЂРѕРєРё",
    leads: lang === "uz" ? "Yangi lidlar" : "РќРѕРІС‹Рµ Р»РёРґС‹",
    debtors: lang === "uz" ? "Yangi qarzdorlar" : "РќРѕРІС‹Рµ РґРѕР»Р¶РЅРёРєРё",
  },
  finance: {
    title: lang === "uz" ? "Moliya" : "Р¤РёРЅР°РЅСЃС‹",
    income: lang === "uz" ? "Tushum" : "Р”РѕС…РѕРґ",
    charges: lang === "uz" ? "Hisobdan yechish" : "РЎРїРёСЃР°РЅРёСЏ",
    topPayments: lang === "uz" ? "Eng katta to'lovlar" : "РљСЂСѓРїРЅРµР№С€РёРµ РїР»Р°С‚РµР¶Рё",
    paymentsCount: lang === "uz" ? "To'lovlar soni" : "РљРѕР»РёС‡РµСЃС‚РІРѕ РїР»Р°С‚РµР¶РµР№",
    studentName: lang === "uz" ? "O'quvchi" : "РЈС‡РµРЅРёРє",
    amount: lang === "uz" ? "Summa" : "РЎСѓРјРјР°",
    method: lang === "uz" ? "Usul" : "РЎРїРѕСЃРѕР±",
    time: lang === "uz" ? "Vaqt" : "Р’СЂРµРјСЏ",
    newDebtors: lang === "uz" ? "Yangi qarzdorlar" : "РќРѕРІС‹Рµ РґРѕР»Р¶РЅРёРєРё",
    totalDebt: lang === "uz" ? "Jami qarz" : "РћР±С‰РёР№ РґРѕР»Рі",
  },
  lessons: {
    title: lang === "uz" ? "Darslar" : "РЈСЂРѕРєРё",
    total: lang === "uz" ? "Jami" : "Р’СЃРµРіРѕ",
    conducted: lang === "uz" ? "O'tkazildi" : "РџСЂРѕРІРµРґРµРЅРѕ",
    cancelled: lang === "uz" ? "Bekor qilindi" : "РћС‚РјРµРЅРµРЅРѕ",
    noAttendance: lang === "uz" ? "Davomat belgilanmagan" : "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ РЅРµ РѕС‚РјРµС‡РµРЅР°",
    noAttendanceWarning: (n: number) => lang === "uz" ? `вљ пёЏ ${n} ta darsda davomat belgilanmagan вЂ” to'lov yo'qotishi!` : `вљ пёЏ Р’ ${n} СѓСЂРѕРєР°С… РЅРµ РѕС‚РјРµС‡РµРЅР° РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ вЂ” РїРѕС‚РµСЂСЏ РѕРїР»Р°С‚С‹!`,
    group: lang === "uz" ? "Guruh" : "Р“СЂСѓРїРїР°",
    teacher: lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ",
    reason: lang === "uz" ? "Sabab" : "РџСЂРёС‡РёРЅР°",
  },
  students: {
    title: lang === "uz" ? "O'quvchilar davomati" : "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ СѓС‡РµРЅРёРєРѕРІ",
    present: lang === "uz" ? "Kelgan" : "РџСЂРёСЃСѓС‚СЃС‚РІСѓСЋС‚",
    absent: lang === "uz" ? "Kelmagan" : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‚",
    late: lang === "uz" ? "Kechikkan" : "РћРїРѕР·РґР°Р»Рё",
    rate: lang === "uz" ? "Davomat" : "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ",
    studentName: lang === "uz" ? "O'quvchi" : "РЈС‡РµРЅРёРє",
    group: lang === "uz" ? "Guruh" : "Р“СЂСѓРїРїР°",
    teacher: lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ",
  },
  teachers: {
    title: lang === "uz" ? "O'qituvchilar" : "РЈС‡РёС‚РµР»СЏ",
    present: lang === "uz" ? "Kelgan" : "РџСЂРёСЃСѓС‚СЃС‚РІСѓСЋС‚",
    late: lang === "uz" ? "Kechikkan" : "РћРїРѕР·РґР°Р»Рё",
    absent: lang === "uz" ? "Kelmagan" : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‚",
    noData: lang === "uz" ? "Ma'lumot yo'q" : "РќРµС‚ РґР°РЅРЅС‹С…",
    teacherName: lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ",
    status: lang === "uz" ? "Holat" : "РЎС‚Р°С‚СѓСЃ",
    checkIn: lang === "uz" ? "Kirish" : "Р’С…РѕРґ",
  },
  leads: {
    title: lang === "uz" ? "Yangi lidlar" : "РќРѕРІС‹Рµ Р»РёРґС‹",
    name: lang === "uz" ? "Ism" : "РРјСЏ",
    source: lang === "uz" ? "Manba" : "РСЃС‚РѕС‡РЅРёРє",
    status: lang === "uz" ? "Holat" : "РЎС‚Р°С‚СѓСЃ",
    time: lang === "uz" ? "Vaqt" : "Р’СЂРµРјСЏ",
  },
  status: {
    present: lang === "uz" ? "Kelgan" : "РџСЂРёСЃСѓС‚СЃС‚РІСѓРµС‚",
    late: lang === "uz" ? "Kechikkan" : "РћРїРѕР·РґР°Р»",
    absent: lang === "uz" ? "Kelmagan" : "РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚",
    new: lang === "uz" ? "Yangi" : "РќРѕРІС‹Р№",
    contacted: lang === "uz" ? "Aloqa qilingan" : "РќР° СЃРІСЏР·Рё",
    converted: lang === "uz" ? "Aylantirilgan" : "РљРѕРЅРІРµСЂС‚РёСЂРѕРІР°РЅ",
    lost: lang === "uz" ? "Yo'qotilgan" : "РџРѕС‚РµСЂСЏРЅ",
  },
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
      setError(e instanceof Error ? e.message : "Error loading report");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Р›РёСЃС‚ 1: Moliya
    const financeData = [
      [lang === "uz" ? "Sana" : "Р”Р°С‚Р°", data.date],
      [lang === "uz" ? "Tushum (bugun)" : "Р”РѕС…РѕРґ (СЃРµРіРѕРґРЅСЏ)", data.finance.income_today],
      [lang === "uz" ? "Tushum (kecha)" : "Р”РѕС…РѕРґ (РІС‡РµСЂР°)", data.finance.income_yesterday],
      [lang === "uz" ? "Farq" : "Р Р°Р·РЅРёС†Р°", data.finance.income_delta],
      [lang === "uz" ? "Hisobdan yechish" : "РЎРїРёСЃР°РЅРёСЏ", data.finance.charges_today],
      [lang === "uz" ? "To'lovlar soni" : "РљРѕР»РёС‡РµСЃС‚РІРѕ РїР»Р°С‚РµР¶РµР№", data.finance.payments_count],
      [lang === "uz" ? "Yangi qarzdorlar" : "РќРѕРІС‹Рµ РґРѕР»Р¶РЅРёРєРё", data.finance.new_debtors_today],
      [lang === "uz" ? "Jami qarz" : "РћР±С‰РёР№ РґРѕР»Рі", data.finance.total_debt],
      [],
      [lang === "uz" ? "Eng katta to'lovlar" : "РљСЂСѓРїРЅРµР№С€РёРµ РїР»Р°С‚РµР¶Рё"],
      [lang === "uz" ? "O'quvchi" : "РЈС‡РµРЅРёРє", lang === "uz" ? "Summa" : "РЎСѓРјРјР°", lang === "uz" ? "Usul" : "РЎРїРѕСЃРѕР±", lang === "uz" ? "Vaqt" : "Р’СЂРµРјСЏ"],
      ...data.finance.top_payments.map((p) => [p.student_name, p.amount, p.method, p.time]),
    ];
    const financeSheet = XLSX.utils.aoa_to_sheet(financeData);
    XLSX.utils.book_append_sheet(wb, financeSheet, "Moliya");

    // Р›РёСЃС‚ 2: Darslar
    const lessonsData = [
      [lang === "uz" ? "Jami darslar" : "Р’СЃРµРіРѕ СѓСЂРѕРєРѕРІ", data.lessons.total],
      [lang === "uz" ? "O'tkazildi" : "РџСЂРѕРІРµРґРµРЅРѕ", data.lessons.conducted],
      [lang === "uz" ? "Bekor qilindi" : "РћС‚РјРµРЅРµРЅРѕ", data.lessons.cancelled],
      [lang === "uz" ? "Davomat belgilanmagan" : "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ РЅРµ РѕС‚РјРµС‡РµРЅР°", data.lessons.no_attendance_count],
      [],
      [lang === "uz" ? "Bekor qilingan darslar" : "РћС‚РјРµРЅРµРЅРЅС‹Рµ СѓСЂРѕРєРё"],
      [lang === "uz" ? "Guruh" : "Р“СЂСѓРїРїР°", lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ", lang === "uz" ? "Vaqt" : "Р’СЂРµРјСЏ", lang === "uz" ? "Sabab" : "РџСЂРёС‡РёРЅР°"],
      ...data.lessons.cancelled_list.map((l) => [l.group_name, l.teacher_name, l.time, l.reason]),
    ];
    const lessonsSheet = XLSX.utils.aoa_to_sheet(lessonsData);
    XLSX.utils.book_append_sheet(wb, lessonsSheet, "Darslar");

    // Р›РёСЃС‚ 3: Davomat
    const attendanceData = [
      [lang === "uz" ? "Jami o'quvchilar" : "Р’СЃРµРіРѕ СѓС‡РµРЅРёРєРѕРІ", data.students.total],
      [lang === "uz" ? "Kelgan" : "РџСЂРёСЃСѓС‚СЃС‚РІСѓСЋС‚", data.students.present],
      [lang === "uz" ? "Kelmagan" : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‚", data.students.absent],
      [lang === "uz" ? "Kechikkan" : "РћРїРѕР·РґР°Р»Рё", data.students.late],
      [lang === "uz" ? "Davomat foizi" : "РџСЂРѕС†РµРЅС‚ РїРѕСЃРµС‰Р°РµРјРѕСЃС‚Рё", `${data.students.attendance_rate}%`],
      [],
      [lang === "uz" ? "Kelmagan o'quvchilar" : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‰РёРµ СѓС‡РµРЅРёРєРё"],
      [lang === "uz" ? "O'quvchi" : "РЈС‡РµРЅРёРє", lang === "uz" ? "Guruh" : "Р“СЂСѓРїРїР°", lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ"],
      ...data.students.absent_list.map((a) => [a.student_name, a.group_name, a.teacher_name]),
    ];
    const attendanceSheet = XLSX.utils.aoa_to_sheet(attendanceData);
    XLSX.utils.book_append_sheet(wb, attendanceSheet, "Davomat");

    // Р›РёСЃС‚ 4: O'qituvchilar
    const teachersData = [
      [lang === "uz" ? "Jami o'qituvchilar" : "Р’СЃРµРіРѕ СѓС‡РёС‚РµР»РµР№", data.teachers.total],
      [lang === "uz" ? "Kelgan" : "РџСЂРёСЃСѓС‚СЃС‚РІСѓСЋС‚", data.teachers.present],
      [lang === "uz" ? "Kechikkan" : "РћРїРѕР·РґР°Р»Рё", data.teachers.late],
      [lang === "uz" ? "Kelmagan" : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‚", data.teachers.absent],
      [lang === "uz" ? "Ma'lumot yo'q" : "РќРµС‚ РґР°РЅРЅС‹С…", data.teachers.no_data],
      [],
      [lang === "uz" ? "O'qituvchilar ro'yxati" : "РЎРїРёСЃРѕРє СѓС‡РёС‚РµР»РµР№"],
      [lang === "uz" ? "O'qituvchi" : "РЈС‡РёС‚РµР»СЊ", lang === "uz" ? "Holat" : "РЎС‚Р°С‚СѓСЃ", lang === "uz" ? "Kirish" : "Р’С…РѕРґ", lang === "uz" ? "Kechikish (daqiqa)" : "РћРїРѕР·РґР°РЅРёРµ (РјРёРЅ)"],
      ...data.teachers.list.map((t) => [t.teacher_name, t.status, t.check_in_time || "-", t.late_minutes || "-"]),
    ];
    const teachersSheet = XLSX.utils.aoa_to_sheet(teachersData);
    XLSX.utils.book_append_sheet(wb, teachersSheet, "O'qituvchilar");

    // Р›РёСЃС‚ 5: Lidlar
    const leadsData = [
      [lang === "uz" ? "Yangi lidlar (bugun)" : "РќРѕРІС‹Рµ Р»РёРґС‹ (СЃРµРіРѕРґРЅСЏ)", data.leads.today],
      [lang === "uz" ? "Yangi lidlar (kecha)" : "РќРѕРІС‹Рµ Р»РёРґС‹ (РІС‡РµСЂР°)", data.leads.yesterday],
      [lang === "uz" ? "Farq" : "Р Р°Р·РЅРёС†Р°", data.leads.delta],
      [],
      [lang === "uz" ? "Yangi lidlar ro'yxati" : "РЎРїРёСЃРѕРє РЅРѕРІС‹С… Р»РёРґРѕРІ"],
      [lang === "uz" ? "Ism" : "РРјСЏ", lang === "uz" ? "Manba" : "РСЃС‚РѕС‡РЅРёРє", lang === "uz" ? "Holat" : "РЎС‚Р°С‚СѓСЃ", lang === "uz" ? "Vaqt" : "Р’СЂРµРјСЏ"],
      ...data.leads.list.map((l) => [l.name, l.source, l.status, l.time]),
    ];
    const leadsSheet = XLSX.utils.aoa_to_sheet(leadsData);
    XLSX.utils.book_append_sheet(wb, leadsSheet, "Lidlar");

    XLSX.writeFile(wb, `daily-report-${data.date}.xlsx`);
  };

  const getDeltaIcon = (deltaStr: string) => {
    const delta = parseFloat(deltaStr);
    if (delta > 0) return <ArrowUp className="h-4 w-4 text-emerald-500" />;
    if (delta < 0) return <ArrowDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present":
        return "bg-emerald-500/100";
      case "late":
        return "bg-amber-500/100";
      case "absent":
        return "bg-destructive/100";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    return labels.status[status as keyof typeof labels.status] || status;
  };

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
        <div className="text-destructive">{error || (lang === "uz" ? "Xatolik yuz berdi" : "РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР°")}</div>
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
          <Button variant="outline" onClick={handlePrint} className="gap-2">
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
        {/* Income */}
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

        {/* Attendance Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.attendance}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.students.attendance_rate}%</div>
            <div className="text-sm text-muted-foreground">
              {lang === "uz" ? "Kecha:" : "Р’С‡РµСЂР°:"} {data.students.attendance_rate_yesterday}%
            </div>
          </CardContent>
        </Card>

        {/* Lessons */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.lessons}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.lessons.conducted} / {data.lessons.total}
            </div>
            <div className="text-sm text-muted-foreground">
              {data.lessons.cancelled} {lang === "uz" ? "bekor qilindi" : "РѕС‚РјРµРЅРµРЅРѕ"}
            </div>
          </CardContent>
        </Card>

        {/* New Leads */}
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

        {/* New Debtors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{labels.kpi.debtors}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.finance.new_debtors_today}</div>
            <div className="text-sm text-muted-foreground">
              {lang === "uz" ? "Jami qarz:" : "РћР±С‰РёР№ РґРѕР»Рі:"} {formatMoney(parseFloat(data.finance.total_debt), lang as Lang)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning Alert */}
      {data.lessons.no_attendance_count > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10 print:bg-white print:border-gray-200">
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
                    <strong>{lesson.group_name}</strong> вЂ” {lesson.teacher_name} ({lesson.time})
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finance & Lessons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Finance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15"><DollarSign className="h-4 w-4 text-emerald-500" /></div>
              {labels.finance.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Top Payments */}
            {data.finance.top_payments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{labels.finance.topPayments}</h4>
                <div className="space-y-2">
                  {data.finance.top_payments.map((payment, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-2 border-b">
                      <div className="flex-1">
                        <div className="font-medium">{payment.student_name}</div>
                        <div className="text-muted-foreground text-xs">
                          {payment.method} В· {payment.time}
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

            {/* Summary */}
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

        {/* Lessons */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e0f2fe]"><BookOpen className="h-4 w-4 text-[#0077b6]" /></div>
              {labels.lessons.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status Summary */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500/100" />
                <span className="text-sm">{labels.lessons.conducted}: {data.lessons.conducted}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive/100" />
                <span className="text-sm">{labels.lessons.cancelled}: {data.lessons.cancelled}</span>
              </div>
            </div>

            {/* Cancelled Lessons */}
            {data.lessons.cancelled_list.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-destructive">{labels.lessons.cancelled}</h4>
                <div className="space-y-2">
                  {data.lessons.cancelled_list.map((lesson, idx) => (
                    <div key={idx} className="text-sm py-2 border-b border-destructive/20">
                      <div className="font-medium">{lesson.group_name}</div>
                      <div className="text-muted-foreground text-xs">
                        {lesson.teacher_name} В· {lesson.time}
                      </div>
                      {lesson.reason && (
                        <div className="text-destructive text-xs mt-1">{lesson.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.lessons.cancelled_list.length === 0 && data.lessons.conducted > 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                {lang === "uz" ? "Bekor qilingan darslar yo'q" : "РћС‚РјРµРЅРµРЅРЅС‹С… СѓСЂРѕРєРѕРІ РЅРµС‚"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Students Attendance & Teachers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Students Attendance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15"><Users className="h-4 w-4 text-violet-500" /></div>
              {labels.students.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{data.students.attendance_rate}%</span>
                <span className="text-muted-foreground">
                  {data.students.present} / {data.students.total}
                </span>
              </div>
              <Progress value={data.students.attendance_rate} className="h-3" />
            </div>

            {/* Stats */}
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

            {/* Absent List */}
            {data.students.absent_list.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-destructive">{labels.students.absent}</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.students.absent_list.map((student, idx) => (
                    <div key={idx} className="text-sm py-2 border-b">
                      <div className="font-medium">{student.student_name}</div>
                      <div className="text-muted-foreground text-xs">
                        {student.group_name} В· {student.teacher_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teachers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15"><UserCheck className="h-4 w-4 text-orange-500" /></div>
              {labels.teachers.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
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

            {/* Teachers List */}
            {data.teachers.list.length > 0 && (
              <div className="max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {data.teachers.list.map((teacher, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm py-2 border-b">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(teacher.status)}`} />
                      <div className="flex-1 font-medium">{teacher.teacher_name}</div>
                      <Badge variant={teacher.status === "present" ? "default" : teacher.status === "late" ? "secondary" : "destructive"} className="text-xs">
                        {getStatusLabel(teacher.status)}
                      </Badge>
                      {teacher.check_in_time && (
                        <span className="text-muted-foreground text-xs">{teacher.check_in_time}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15"><Target className="h-4 w-4 text-rose-500" /></div>
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
                        <Badge variant="outline" className="text-xs">
                          {getStatusLabel(lead.status)}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{lead.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              {lang === "uz" ? "Yangi lidlar yo'q" : "РќРѕРІС‹С… Р»РёРґРѕРІ РЅРµС‚"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:m-0 { margin: 0 !important; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:border-gray-200 { border-color: #e5e7eb !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
