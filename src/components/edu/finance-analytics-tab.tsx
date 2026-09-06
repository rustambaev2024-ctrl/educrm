import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Download } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DateInput } from "@/components/edu/date-input";
import { analyticsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/data/store";
import { useI18n, type Lang } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type PeriodPreset = "month" | "quarter" | "half_year" | "year" | "custom";

interface FinanceAnalyticsTabProps {
  /** Если передан — фильтр по конкретному филиалу (для директора с выбором). */
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
 * Бэкенд отдаёт денежные суммы строками (`Decimal` квантуется и сериализуется
 * через `str()` в `services.py`, чтобы не терять точность в JSON) — recharts
 * же требует числовые поля для оси/высоты столбцов. Без этой конвертации
 * графики рисуются пустыми или нулевой высоты, без ошибки в консоли.
 */
function numericField<T extends Record<string, any>>(rows: T[], field: keyof T): (T & Record<string, number>)[] {
  return rows.map((row) => ({ ...row, [field]: Number(row[field]) }));
}

export function FinanceAnalyticsTab({ branchId }: FinanceAnalyticsTabProps) {
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<any | null>(null);
  const [profitability, setProfitability] = useState<any | null>(null);
  const [debtors, setDebtors] = useState<any | null>(null);
  const [forecast, setForecast] = useState<any | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") {
      // Пока обе даты произвольного диапазона не заполнены — не запрашиваем
      // с половинчатыми параметрами, ждём обе.
      if (!customFrom || !customTo) return null;
      return { date_from: customFrom, date_to: customTo };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const revenueByDayChart = useMemo(
    () => numericField(revenue?.by_day ?? [], "total"),
    [revenue],
  );
  const profitabilityByBranchChart = useMemo(
    () => numericField(profitability?.by_branch ?? [], "profit"),
    [profitability],
  );

  const params = useMemo(() => {
    if (!range) return null;
    const p: Record<string, string> = { ...range };
    if (branchId) p.branch_id = branchId;
    return p;
  }, [range, branchId]);

  useEffect(() => {
    if (!params) {
      // Свой диапазон выбран, но обе даты ещё не введены — ничего не грузим,
      // не показываем ни спиннер, ни пустые блоки как ошибку. Чистим данные
      // предыдущего периода, иначе карточки молча показывают устаревшие цифры
      // под селектором, который уже указывает на другой, ещё не загруженный
      // диапазон.
      setRevenue(null);
      setProfitability(null);
      setDebtors(null);
      setForecast(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      analyticsApi.revenue(params),
      analyticsApi.profitability(params),
      analyticsApi.debtors(params),
      analyticsApi.revenueForecast(params),
    ])
      .then(([r, p, d, f]) => {
        if (cancelled) return;
        setRevenue(r);
        setProfitability(p);
        setDebtors(d);
        setForecast(f);
      })
      .catch((e) => {
        if (cancelled) return;
        // Та же логика: на ошибке не оставляем цифры прошлого периода —
        // сбрасываем всё, чтобы карточки ушли в свой пустой стейт.
        setRevenue(null);
        setProfitability(null);
        setDebtors(null);
        setForecast(null);
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
      const { exportReport } = await import("@/lib/api");
      await exportReport(kind, { report_type: "finance_analytics", ...params });
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
            <DateInput
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              maxDate={customTo || undefined}
            />
            <span className="text-sm text-muted-foreground">—</span>
            <DateInput
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              minDate={customFrom || undefined}
            />
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

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("director.monthlyRevenue")}</h3>
        {revenueByDayChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenueByDayChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <BreakdownTable title={t("financeAnalytics.byBranch")} rows={revenue?.by_branch ?? []} nameKey="branch_name" lang={lang} />
          <BreakdownTable title={t("financeAnalytics.byCourse")} rows={revenue?.by_course ?? []} nameKey="course_name" lang={lang} />
          <BreakdownTable title={t("financeAnalytics.byTeacher")} rows={revenue?.by_teacher ?? []} nameKey="teacher_name" lang={lang} />
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("financeAnalytics.profitMargin")}</h3>
        {profitabilityByBranchChart.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={profitabilityByBranchChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="profit" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-6">
          <BreakdownTable
            title={t("financeAnalytics.expenseByCategory")}
            rows={profitability?.expense_by_category ?? []}
            nameKey="category"
            lang={lang}
          />
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("financeAnalytics.debtCollection")}</h3>
        <div className="mb-4 text-2xl font-bold tabular-nums">
          {debtors?.collection_rate ?? "0"}% <span className="text-sm font-normal text-muted-foreground">{t("financeAnalytics.collectionRate")}</span>
        </div>
        {debtors?.results?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.col.student")}</TableHead>
                <TableHead className="text-right">{t("students.col.balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtors.results.map((row: any) => (
                <TableRow key={row.student_id}>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell className="text-right text-destructive">{formatMoney(Number(row.wallet_balance), lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Qarzdorlar yo'q" : "Должников нет"} />
        )}
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-2 text-base font-semibold">{t("financeAnalytics.forecastNextMonth")}</h3>
        <div className="text-3xl font-bold tabular-nums text-primary">
          {formatMoney(Number(forecast?.forecast_revenue ?? 0), lang)}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {formatMoney(Number(forecast?.potential_revenue ?? 0), lang)} × ({100 - Number(forecast?.shortfall_rate_percent ?? 0)}%)
        </div>
        {forecast && !forecast.has_sufficient_history && (
          <div className="mt-3 flex items-center gap-2 text-xs text-warn">
            <AlertCircle className="size-3.5" /> {t("financeAnalytics.forecastInsufficientHistory")}
          </div>
        )}
      </Card>
    </div>
  );
}

function BreakdownTable({ title, rows, nameKey, lang }: { title: string; rows: any[]; nameKey: string; lang: Lang }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">{lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"}</div>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 5).map((row, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate text-foreground">{row[nameKey]}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(Number(row.total), lang)}</span>
            </div>
          ))}
        </div>
      )}
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
