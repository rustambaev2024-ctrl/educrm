import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Download, TrendingUp, UserCheck, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Legend as ChartLegend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/edu/kpi-card";
import { DateInput } from "@/components/edu/date-input";
import { analyticsApi, exportReport } from "@/lib/api";
import { apiErrorMessage } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

type PeriodPreset = "month" | "quarter" | "half_year" | "year" | "custom";

interface CenterSummaryTabProps {
  /** Если передан — фильтр по конкретному филиалу. */
  branchId?: string;
}

function localDateIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function presetRange(preset: Exclude<PeriodPreset, "custom">): { date_from: string; date_to: string } {
  const today = new Date();
  const to = localDateIso(today);
  const from = new Date(today);
  if (preset === "month") from.setMonth(from.getMonth() - 1);
  if (preset === "quarter") from.setMonth(from.getMonth() - 3);
  if (preset === "half_year") from.setMonth(from.getMonth() - 6);
  if (preset === "year") from.setFullYear(from.getFullYear() - 1);
  return { date_from: localDateIso(from), date_to: to };
}

/**
 * Проценты приходят с бэкенда строками (Decimal сериализуется через str(),
 * чтобы не терять точность) — recharts же нужны числа для оси и высоты линии.
 * Без конвертации график рисуется пустым, молча, без ошибки в консоли.
 */
function numericField<T extends Record<string, any>>(rows: T[], field: keyof T): (T & Record<string, number>)[] {
  return rows.map((row) => ({ ...row, [field]: Number(row[field]) }));
}

export function CenterSummaryTab({ branchId }: CenterSummaryTabProps) {
  const { t, lang } = useI18n();
  // Полгода по умолчанию: тренды считаются по месяцам, и на месячном
  // периоде график был бы из одной точки.
  const [preset, setPreset] = useState<PeriodPreset>("half_year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<any | null>(null);
  const [enrollment, setEnrollment] = useState<any | null>(null);
  const [occupancy, setOccupancy] = useState<any | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") {
      // Пока обе даты не заполнены — не запрашиваем с половинчатыми параметрами.
      if (!customFrom || !customTo) return null;
      return { date_from: customFrom, date_to: customTo };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const params = useMemo(() => {
    if (!range) return null;
    const p: Record<string, string> = { ...range };
    if (branchId) p.branch_id = branchId;
    return p;
  }, [range, branchId]);

  const attendanceChart = useMemo(
    () => numericField(attendance?.by_day ?? [], "attendance_rate"),
    [attendance],
  );
  const occupancyChart = useMemo(
    () => numericField(occupancy?.results ?? [], "occupancy_percent"),
    [occupancy],
  );

  useEffect(() => {
    if (!params) {
      // Данные предыдущего периода чистим: иначе карточки молча показывают
      // устаревшие цифры под селектором, который указывает на другой период.
      setOverview(null);
      setAttendance(null);
      setEnrollment(null);
      setOccupancy(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      analyticsApi.overview(params),
      analyticsApi.attendance(params),
      analyticsApi.enrollmentTrend(params),
      analyticsApi.occupancyTrend(params),
    ])
      .then(([o, a, e, oc]) => {
        if (cancelled) return;
        setOverview(o);
        setAttendance(a);
        setEnrollment(e);
        setOccupancy(oc);
      })
      .catch((e) => {
        if (cancelled) return;
        setOverview(null);
        setAttendance(null);
        setEnrollment(null);
        setOccupancy(null);
        toast.error(apiErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const handleExport = async (kind: "excel" | "pdf") => {
    if (exporting || !params) return;
    setExporting(kind);
    try {
      await exportReport(kind, { report_type: "center_summary", ...params });
      toast.success(lang === "uz" ? "Fayl yuklandi" : "Файл скачан");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  const noData = lang === "uz" ? "Ma'lumot yo'q" : "Данных нет";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t("financeAnalytics.periodThisMonth")}</SelectItem>
            <SelectItem value="quarter">{t("financeAnalytics.periodQuarter")}</SelectItem>
            <SelectItem value="half_year">{t("financeAnalytics.periodSixMonths")}</SelectItem>
            <SelectItem value="year">{t("financeAnalytics.periodYear")}</SelectItem>
            <SelectItem value="custom">{t("financeAnalytics.periodCustom")}</SelectItem>
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <DateInput value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} maxDate={customTo || undefined} />
            <span className="text-sm text-muted-foreground">—</span>
            <DateInput value={customTo} onChange={(e) => setCustomTo(e.target.value)} minDate={customFrom || undefined} />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!!exporting || !params} onClick={() => handleExport("excel")}>
            <Download className="size-3.5 mr-1" /> {t("financeAnalytics.exportExcel")}
          </Button>
          <Button variant="outline" size="sm" disabled={!!exporting || !params} onClick={() => handleExport("pdf")}>
            <Download className="size-3.5 mr-1" /> {t("financeAnalytics.exportPdf")}
          </Button>
        </div>
      </div>

      {preset === "custom" && !params && (
        <div className="text-sm text-muted-foreground">
          {lang === "uz" ? "Ikkala sanani ham kiriting" : "Укажите обе даты диапазона"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("centerSummary.studentsTotal")} value={`${overview?.students_total ?? 0}`} icon={Users} color="blue" />
        <KpiCard label={t("centerSummary.studentsActive")} value={`${overview?.students_active ?? 0}`} icon={UserCheck} color="green" />
        <KpiCard label={t("centerSummary.debtors")} value={`${overview?.debtors_count ?? 0}`} icon={AlertTriangle} color="amber" />
        <KpiCard label={t("centerSummary.attendanceRate")} value={`${overview?.attendance_rate ?? "0"}%`} icon={TrendingUp} color="violet" />
      </div>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.attendanceTrend")}</h3>
        {attendanceChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={attendanceChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: any) => [`${value}%`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="attendance_rate" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={noData} />
        )}
        <div className="mt-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("centerSummary.attendanceByBranch")}
          </div>
          {attendance?.results?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "uz" ? "Filial" : "Филиал"}</TableHead>
                  <TableHead className="text-right">{t("centerSummary.attendanceRate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.results.map((row: any) => (
                  <TableRow key={row.branch_id}>
                    <TableCell>{row.branch_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.attendance_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-xs text-muted-foreground">{noData}</div>
          )}
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.enrollmentTrend")}</h3>
        {enrollment?.results?.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={enrollment.results}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <ChartLegend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enrolled" name={t("centerSummary.enrolled")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="churned" name={t("centerSummary.churned")} fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={noData} />
        )}
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.occupancyTrend")}</h3>
        {occupancyChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={occupancyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: any) => [`${value}%`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="occupancy_percent" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={noData} />
        )}
        <div className="mt-4 text-sm text-muted-foreground">
          {t("centerSummary.capacity")}: {occupancy?.capacity ?? 0}
        </div>
      </Card>
    </div>
  );
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
      <AlertCircle className="size-8 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium text-foreground">{label}</div>
    </div>
  );
}
