import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, CalendarDays, CreditCard, UserRound, Percent, Briefcase, WalletCards, ReceiptText, Ban } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { Group, Payment, PaymentMethod, Staff, StaffPenalty } from "@/lib/data/types";

export const Route = createFileRoute("/director/salaries")({ component: DirectorSalaries });

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "click", "payme"];

type SalaryRow = {
  staff: Staff;
  isTeacher: boolean;
  groupCount: number;
  studentCount: number;
  base: number;
  percent: number;
  fixedSalary: number;
  grossDue: number;
  penalties: number;
  due: number;
  paid: number;
  remaining: number;
  overpaid: number;
};

function calculateSalaryRow(staffMember: Staff, groups: Group[], periodPayments: Payment[], periodPenalties: StaffPenalty[]): SalaryRow {
  const isTeacher = staffMember.role === "teacher";
  const teacherGroups = groups.filter((group) => group.teacherId === staffMember.id);
  const groupIds = new Set(teacherGroups.map((group) => group.id));
  const base = isTeacher
    ? periodPayments
      .filter((payment) => payment.type === "charge" && payment.category !== "absent_charge" && payment.groupId && groupIds.has(payment.groupId))
      .reduce((sum, payment) => sum + payment.amount, 0)
    : 0;
  const percent = staffMember.salaryPercent ?? 40;
  const fixedSalary = staffMember.fixedSalary ?? 0;
  const grossDue = isTeacher ? Math.round((base * percent) / 100) : fixedSalary;
  const penalties = periodPenalties
    .filter((penalty) => penalty.staffId === staffMember.id && penalty.status === "active")
    .reduce((sum, penalty) => sum + penalty.amount, 0);
  const due = Math.max(grossDue - penalties, 0);
  const paid = periodPayments
    .filter((payment) => payment.direction === "out" && payment.category === "salary" && payment.staffId === staffMember.id)
    .reduce((sum, payment) => sum + payment.amount, 0);

  return {
    staff: staffMember,
    isTeacher,
    groupCount: teacherGroups.length,
    studentCount: teacherGroups.reduce((sum, group) => sum + group.studentIds.length, 0),
    base,
    percent,
    fixedSalary,
    grossDue,
    penalties,
    due,
    paid,
    remaining: Math.max(due - paid, 0),
    overpaid: Math.max(paid - due, 0),
  };
}

function DirectorSalaries() {
  const { t, lang } = useI18n();
  const { staff, groups, payments, penalties, branches, addPayment, isLoading } = useData();
  const activeStaff = useMemo(() => staff.filter((item) => item.role !== "director"), [staff]);
  const [staffId, setStaffId] = useState(() => activeStaff[0]?.id ?? "");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const monthRange = useMemo(() => {
    const start = new Date(`${period}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [period]);

  const periodPayments = useMemo(
    () =>
      payments.filter((payment) => {
      const ts = new Date(payment.date).getTime();
      return ts >= monthRange.start.getTime() && ts < monthRange.end.getTime();
      }),
    [monthRange, payments],
  );
  const periodPenalties = useMemo(
    () =>
      penalties.filter((penalty) => {
        const ts = new Date(`${penalty.penaltyDate}T00:00:00`).getTime();
        return ts >= monthRange.start.getTime() && ts < monthRange.end.getTime();
      }),
    [monthRange, penalties],
  );

  const salaryRows = useMemo(
    () => activeStaff.map((item) => calculateSalaryRow(item, groups, periodPayments, periodPenalties)),
    [activeStaff, groups, periodPayments, periodPenalties],
  );
  const selectedRow = salaryRows.find((row) => row.staff.id === staffId) ?? salaryRows[0];
  const selected = selectedRow?.staff;
  const isTeacher = selectedRow?.isTeacher ?? false;
  const calculation = selectedRow ?? { base: 0, grossDue: 0, penalties: 0, due: 0, paid: 0, remaining: 0, percent: 0, overpaid: 0, groupCount: 0, studentCount: 0 };

  const totals = useMemo(
    () =>
      salaryRows.reduce(
        (sum, row) => ({
          due: sum.due + row.due,
          paid: sum.paid + row.paid,
          remaining: sum.remaining + row.remaining,
          base: sum.base + row.base,
          penalties: sum.penalties + row.penalties,
          grossDue: sum.grossDue + row.grossDue,
        }),
        { due: 0, paid: 0, remaining: 0, base: 0, penalties: 0, grossDue: 0 },
      ),
    [salaryRows],
  );

  const salaryHistory = payments
    .filter((payment) => payment.direction === "out" && payment.category === "salary")
    .sort((a, b) => b.date.localeCompare(a.date));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const savePayout = () => {
    if (!selected) return;
    const payout = Number(amount);
    if (!payout || payout <= 0) return;
    addPayment({
      staffId: selected.id,
      branchId: selected.branchId ?? branches[0]?.id ?? "",
      amount: payout,
      direction: "out",
      type: "expense",
      method,
      date: new Date().toISOString(),
      category: "salary",
      comment: `${period} salary payout for ${selected.fullName}`,
    });
    toast.success(lang === "uz" ? "Ish haqi to'lovi saqlandi" : "Выплата зарплаты сохранена");
    setAmount("");
  };

  return (
    <>
      <PageHeader
        title={lang === "uz" ? "Ish haqi hisob-kitobi" : "Расчёт зарплат"}
        description={lang === "uz" ? "Foizli o'qituvchilar va oylik xodimlar uchun to'lovlar" : "Выплаты учителям по проценту и сотрудникам по фиксированной ставке"}
      />
      <div className="space-y-5 p-4 md:p-8">
        <Card className="p-4 shadow-elegant">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px_200px_200px]">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{lang === "uz" ? "Hisob-kitob oyi" : "Месяц расчёта"}</Label>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "uz" ? "Tanlangan xodim" : "Выбранный сотрудник"}</Label>
                <Select value={selected?.id ?? ""} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder={lang === "uz" ? "Xodim tanlang" : "Выберите сотрудника"} /></SelectTrigger>
                  <SelectContent>
                    {salaryRows.map((row) => (
                      <SelectItem key={row.staff.id} value={row.staff.id}>
                        {row.staff.fullName} · {row.isTeacher ? `${row.percent}%` : formatMoney(row.fixedSalary, lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <SalaryKpi icon={BadgeDollarSign} label={lang === "uz" ? "Jarimadan oldin" : "До штрафов"} value={formatMoney(totals.grossDue, lang)} />
            <SalaryKpi icon={Ban} label={lang === "uz" ? "Jami jarimalar" : "Штрафы"} value={formatMoney(totals.penalties, lang)} tone={totals.penalties > 0 ? "warning" : "default"} />
            <SalaryKpi icon={CreditCard} label={lang === "uz" ? "Jami qoldiq" : "Всего к выплате"} value={formatMoney(totals.remaining, lang)} tone={totals.remaining > 0 ? "warning" : "default"} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Card className="overflow-hidden shadow-elegant">
              <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserRound className="size-4 text-primary" />
                    {selected?.fullName ?? (lang === "uz" ? "Xodim tanlanmagan" : "Сотрудник не выбран")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selected
                      ? `${t(`role.${selected.role}`)} · ${isTeacher ? (lang === "uz" ? "foizli ish haqi" : "процентная зарплата") : (lang === "uz" ? "belgilangan oylik" : "фиксированный оклад")}`
                      : "-"}
                  </div>
                </div>
                <Badge variant={calculation.remaining > 0 ? "destructive" : "outline"} className="w-fit">
                  {calculation.remaining > 0
                    ? `${lang === "uz" ? "Qoldiq" : "К выплате"}: ${formatMoney(calculation.remaining, lang)}`
                    : lang === "uz" ? "Yopilgan" : "Закрыто"}
                </Badge>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
                <Info label={lang === "uz" ? "Hisoblash turi" : "Тип расчёта"} value={isTeacher ? (lang === "uz" ? "Foiz" : "Процент") : (lang === "uz" ? "Oylik" : "Оклад")} icon={isTeacher ? <Percent className="mr-1 inline size-3" /> : <Briefcase className="mr-1 inline size-3" />} />
                <Info label={isTeacher ? (lang === "uz" ? "Tushum bazasi" : "База начисления") : (lang === "uz" ? "Oylik stavka" : "Месячная ставка")} value={formatMoney(isTeacher ? calculation.base : (selected?.fixedSalary ?? 0), lang)} />
                <Info label={lang === "uz" ? "Jarimadan oldin" : "До штрафов"} value={formatMoney(calculation.grossDue, lang)} />
                <Info label={lang === "uz" ? "Jarimalar" : "Штрафы"} value={`-${formatMoney(calculation.penalties, lang)}`} />
                <Info label={lang === "uz" ? "To'lovga" : "К выплате"} value={formatMoney(calculation.due, lang)} />
                <Info label={lang === "uz" ? "To'langan" : "Выплачено"} value={formatMoney(calculation.paid, lang)} />
              </div>

              <div className="border-t border-border/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ReceiptText className="size-4 text-primary" />
                  {lang === "uz" ? "Hisob-kitob tafsiloti" : "Детализация расчёта"}
                </div>
                {isTeacher ? (
                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <BreakdownItem label={lang === "uz" ? "Guruhlar" : "Группы"} value={`${calculation.groupCount ?? 0}`} />
                    <BreakdownItem label={lang === "uz" ? "O'quvchilar" : "Ученики"} value={`${calculation.studentCount ?? 0}`} />
                    <BreakdownItem label={lang === "uz" ? "Formula" : "Формула"} value={`${formatMoney(calculation.base, lang)} × ${calculation.percent}% = ${formatMoney(calculation.grossDue, lang)}`} strong />
                    <BreakdownItem label={lang === "uz" ? "Jarimalardan keyin" : "После штрафов"} value={`${formatMoney(calculation.grossDue, lang)} - ${formatMoney(calculation.penalties, lang)} = ${formatMoney(calculation.due, lang)}`} strong />
                  </div>
                ) : (
                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <BreakdownItem label={lang === "uz" ? "Oylik stavka" : "Месячная ставка"} value={formatMoney(selected?.fixedSalary ?? 0, lang)} />
                    <BreakdownItem label={lang === "uz" ? "Davr" : "Период"} value={period} />
                    <BreakdownItem label={lang === "uz" ? "Jarimalar" : "Штрафы"} value={`-${formatMoney(calculation.penalties, lang)}`} />
                    <BreakdownItem label={lang === "uz" ? "To'lovga" : "К выплате"} value={formatMoney(calculation.due, lang)} strong />
                  </div>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden shadow-elegant">
              <div className="flex items-center justify-between border-b border-border/60 p-4">
                <div className="text-sm font-semibold">{lang === "uz" ? "Oylik vedomosti" : "Зарплатная ведомость"}</div>
                <Badge variant="outline">{salaryRows.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "uz" ? "Xodim" : "Сотрудник"}</TableHead>
                    <TableHead>{lang === "uz" ? "Turi" : "Тип"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "Baza / stavka" : "База / ставка"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "Hisoblangan" : "Начислено"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "Jarimalar" : "Штрафы"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "To'lovga" : "К выплате"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "To'langan" : "Выплачено"}</TableHead>
                    <TableHead className="text-right">{lang === "uz" ? "Qoldiq" : "Остаток"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaryRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</TableCell></TableRow>
                  ) : salaryRows.map((row) => (
                    <TableRow
                      key={row.staff.id}
                      className={`cursor-pointer ${selected?.id === row.staff.id ? "bg-primary/10 hover:bg-primary/10" : ""}`}
                      onClick={() => setStaffId(row.staff.id)}
                    >
                      <TableCell>
                        <div className="font-medium">{row.staff.fullName}</div>
                        <div className="text-xs text-muted-foreground">{t(`role.${row.staff.role}`)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="whitespace-nowrap">
                          {row.isTeacher ? `${row.percent}%` : (lang === "uz" ? "Oylik" : "Оклад")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatMoney(row.isTeacher ? row.base : row.fixedSalary, lang)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(row.grossDue, lang)}</TableCell>
                      <TableCell className={`text-right ${row.penalties > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                        {row.penalties > 0 ? `-${formatMoney(row.penalties, lang)}` : formatMoney(0, lang)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(row.due, lang)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.paid, lang)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.remaining > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                        {formatMoney(row.remaining, lang)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          <Card className="h-fit space-y-4 p-4 shadow-elegant xl:sticky xl:top-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <WalletCards className="size-4 text-primary" />
                {lang === "uz" ? "To'lov berish" : "Выдать выплату"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selected ? selected.fullName : lang === "uz" ? "Avval xodim tanlang" : "Сначала выберите сотрудника"}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "uz" ? "Jarimadan oldin" : "До штрафов"}</span>
                <span className="font-semibold">{formatMoney(calculation.grossDue, lang)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "uz" ? "Jarimalar" : "Штрафы"}</span>
                <span className="font-semibold text-destructive">-{formatMoney(calculation.penalties, lang)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "uz" ? "To'lovga" : "К выплате"}</span>
                <span className="font-semibold">{formatMoney(calculation.due, lang)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "uz" ? "To'langan" : "Выплачено"}</span>
                <span className="font-semibold">{formatMoney(calculation.paid, lang)}</span>
              </div>
              <div className="mt-2 border-t border-border/60 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{lang === "uz" ? "Qoldiq" : "Остаток"}</span>
                  <span className="text-lg font-bold">{formatMoney(calculation.remaining, lang)}</span>
                </div>
                {calculation.overpaid > 0 && (
                  <div className="mt-1 text-xs text-destructive">
                    {lang === "uz" ? "Ortiqcha to'langan" : "Переплата"}: {formatMoney(calculation.overpaid, lang)}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{lang === "uz" ? "Summa" : "Сумма"}</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAmount(String(calculation.remaining))} disabled={!calculation.remaining}>
                  {lang === "uz" ? "Qoldiqni qo'yish" : "Весь остаток"}
                </Button>
              </div>
              <Input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(calculation.remaining || calculation.due)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Usul" : "Способ"}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((item) => <SelectItem key={item} value={item}>{t(`finance.method.${item}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={savePayout} disabled={!selected || Number(amount) <= 0}>
              {lang === "uz" ? "To'lovni saqlash" : "Сохранить выплату"}
            </Button>
          </Card>
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">{lang === "uz" ? "Oxirgi to'lovlar" : "Последние выплаты"}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "uz" ? "Xodim" : "Сотрудник"}</TableHead>
                <TableHead>{lang === "uz" ? "Turi" : "Тип"}</TableHead>
                <TableHead>{lang === "uz" ? "Sana" : "Дата"}</TableHead>
                <TableHead>{lang === "uz" ? "Usul" : "Способ"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Summa" : "Сумма"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaryHistory.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</TableCell></TableRow>
              ) : salaryHistory.map((payment) => {
                const staffMember = staff.find((item) => item.id === payment.staffId);
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{staffMember?.fullName ?? payment.comment ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {staffMember?.role === "teacher"
                          ? (lang === "uz" ? "Foizli" : "Процент")
                          : (lang === "uz" ? "Oylik" : "Оклад")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(payment.date, lang)}</TableCell>
                    <TableCell>{t(`finance.method.${payment.method}`)}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">-{formatMoney(payment.amount, lang)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function SalaryKpi({ icon: Icon, label, value, tone = "default" }: { icon: typeof CalendarDays; label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className={`flex size-10 items-center justify-center rounded-lg ${tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-primary/15 text-primary"}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{icon}{value}</div>
    </div>
  );
}

function BreakdownItem({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{value}</div>
    </div>
  );
}
