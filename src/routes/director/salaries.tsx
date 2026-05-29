import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, Briefcase, CreditCard, Percent, ReceiptText, UserRound, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [payRow, setPayRow] = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [detailRow, setDetailRow] = useState<SalaryRow | null>(null);

  const monthRange = useMemo(() => {
    const start = new Date(`${period}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [period]);

  const periodPayments = useMemo(
    () => payments.filter((payment) => {
      const ts = new Date(payment.date).getTime();
      return ts >= monthRange.start.getTime() && ts < monthRange.end.getTime();
    }),
    [monthRange, payments],
  );

  const periodPenalties = useMemo(
    () => penalties.filter((penalty) => {
      const ts = new Date(`${penalty.penaltyDate}T00:00:00`).getTime();
      return ts >= monthRange.start.getTime() && ts < monthRange.end.getTime();
    }),
    [monthRange, penalties],
  );

  const salaryRows = useMemo(
    () => activeStaff.map((item) => calculateSalaryRow(item, groups, periodPayments, periodPenalties)),
    [activeStaff, groups, periodPayments, periodPenalties],
  );

  const totals = useMemo(
    () => salaryRows.reduce(
      (sum, row) => ({
        grossDue: sum.grossDue + row.grossDue,
        paid: sum.paid + row.paid,
        remaining: sum.remaining + row.remaining,
      }),
      { grossDue: 0, paid: 0, remaining: 0 },
    ),
    [salaryRows],
  );

  const salaryHistory = payments
    .filter((payment) => payment.direction === "out" && payment.category === "salary")
    .sort((a, b) => b.date.localeCompare(a.date));

  const openPayDialog = (row: SalaryRow) => {
    setPayRow(row);
    setPayAmount(String(row.remaining));
    setPayMethod("cash");
  };

  const handlePay = () => {
    if (!payRow) return;
    const payout = Number(payAmount);
    if (!payout || payout <= 0) return;
    addPayment({
      staffId: payRow.staff.id,
      branchId: payRow.staff.branchId ?? branches[0]?.id ?? "",
      amount: payout,
      direction: "out",
      type: "expense",
      method: payMethod,
      date: new Date().toISOString(),
      category: "salary",
      comment: `${period} salary payout for ${payRow.staff.fullName}`,
    });
    toast.success(lang === "uz" ? "Ish haqi to'lovi saqlandi" : "Выплата зарплаты сохранена");
    setPayRow(null);
    setPayAmount("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={lang === "uz" ? "Ish haqi hisob-kitobi" : "Расчёт зарплат"}
        description={lang === "uz" ? "Foizli o'qituvchilar va oylik xodimlar uchun to'lovlar" : "Выплаты учителям по проценту и сотрудникам по фиксированной ставке"}
      />

      <div className="space-y-5 p-4 md:p-8">
        <div className="w-48 space-y-1.5">
          <Label>{lang === "uz" ? "Hisob-kitob oyi" : "Месяц расчёта"}</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} autoComplete="off" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SalaryKpi icon={BadgeDollarSign} label={lang === "uz" ? "Jami hisoblangan" : "Всего начислено"} value={formatMoney(totals.grossDue, lang)} />
          <SalaryKpi icon={CreditCard} label={lang === "uz" ? "Jami to'langan" : "Всего выплачено"} value={formatMoney(totals.paid, lang)} tone="success" />
          <SalaryKpi icon={WalletCards} label={lang === "uz" ? "Jami qoldiq" : "Всего к выплате"} value={formatMoney(totals.remaining, lang)} tone={totals.remaining > 0 ? "warning" : "default"} />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "uz" ? "Xodim" : "Сотрудник"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Hisoblangan" : "Начислено"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Jarimalar" : "Штрафы"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "To'langan" : "Выплачено"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Qoldiq" : "Остаток"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Amal" : "Действие"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaryRows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</TableCell></TableRow>
              ) : salaryRows.map((row) => (
                <TableRow key={row.staff.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailRow(row)}>
                  <TableCell>
                    <div className="font-medium">{row.staff.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`role.${row.staff.role}`)} · {row.isTeacher ? `${row.percent}%` : (lang === "uz" ? "Oylik" : "Оклад")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(row.grossDue, lang)}</TableCell>
                  <TableCell className={`text-right ${row.penalties > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {row.penalties > 0 ? `-${formatMoney(row.penalties, lang)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatMoney(row.paid, lang)}</TableCell>
                  <TableCell className={`text-right font-semibold ${row.remaining > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                    {formatMoney(row.remaining, lang)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {row.remaining > 0 && (
                      <Button size="sm" variant="outline" onClick={() => openPayDialog(row)}>
                        {lang === "uz" ? "To'lash" : "Выдать"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">
            {lang === "uz" ? "Oxirgi to'lovlar" : "Последние выплаты"}
          </div>
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

      <Dialog open={!!payRow} onOpenChange={(open) => !open && setPayRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{lang === "uz" ? "To'lov berish" : "Выдать зарплату"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="font-semibold">{payRow?.staff.fullName}</div>
              <div className="mt-1 text-muted-foreground">
                {lang === "uz" ? "Qoldiq" : "Остаток"}:{" "}
                <span className="font-semibold text-foreground">{formatMoney(payRow?.remaining ?? 0, lang)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Summa" : "Сумма"}</Label>
              <Input type="number" min={0} step={1000} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Usul" : "Способ оплаты"}</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{t(`finance.method.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)}>
              {lang === "uz" ? "Bekor qilish" : "Отмена"}
            </Button>
            <Button onClick={handlePay} disabled={Number(payAmount) <= 0}>
              {lang === "uz" ? "Tasdiqlash" : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detailRow?.staff.fullName}</SheetTitle>
          </SheetHeader>
          {detailRow && (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="size-4 text-primary" />
                  {t(`role.${detailRow.staff.role}`)} · {detailRow.isTeacher
                    ? (lang === "uz" ? "foizli ish haqi" : "процентная зарплата")
                    : (lang === "uz" ? "belgilangan oylik" : "фиксированный оклад")}
                </div>
                <Badge variant={detailRow.remaining > 0 ? "destructive" : "outline"} className="w-fit">
                  {detailRow.remaining > 0
                    ? `${lang === "uz" ? "Qoldiq" : "К выплате"}: ${formatMoney(detailRow.remaining, lang)}`
                    : (lang === "uz" ? "Yopilgan" : "Закрыто")}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Info
                  label={lang === "uz" ? "Hisoblash turi" : "Тип расчёта"}
                  value={detailRow.isTeacher ? (lang === "uz" ? "Foiz" : "Процент") : (lang === "uz" ? "Oylik" : "Оклад")}
                  icon={detailRow.isTeacher ? <Percent className="mr-1 inline size-3" /> : <Briefcase className="mr-1 inline size-3" />}
                />
                <Info
                  label={detailRow.isTeacher ? (lang === "uz" ? "Tushum bazasi" : "База начисления") : (lang === "uz" ? "Oylik stavka" : "Месячная ставка")}
                  value={formatMoney(detailRow.isTeacher ? detailRow.base : (detailRow.staff.fixedSalary ?? 0), lang)}
                />
                <Info label={lang === "uz" ? "Jarimadan oldin" : "До штрафов"} value={formatMoney(detailRow.grossDue, lang)} />
                <Info label={lang === "uz" ? "Jarimalar" : "Штрафы"} value={`-${formatMoney(detailRow.penalties, lang)}`} />
                <Info label={lang === "uz" ? "To'lovga" : "К выплате"} value={formatMoney(detailRow.due, lang)} />
                <Info label={lang === "uz" ? "To'langan" : "Выплачено"} value={formatMoney(detailRow.paid, lang)} />
              </div>

              <div className="rounded-lg border border-border/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ReceiptText className="size-4 text-primary" />
                  {lang === "uz" ? "Hisob-kitob tafsiloti" : "Детализация расчёта"}
                </div>
                {detailRow.isTeacher ? (
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <BreakdownItem label={lang === "uz" ? "Guruhlar" : "Группы"} value={`${detailRow.groupCount}`} />
                    <BreakdownItem label={lang === "uz" ? "O'quvchilar" : "Ученики"} value={`${detailRow.studentCount}`} />
                    <BreakdownItem
                      label={lang === "uz" ? "Formula" : "Формула"}
                      value={`${formatMoney(detailRow.base, lang)} × ${detailRow.percent}% = ${formatMoney(detailRow.grossDue, lang)}`}
                      strong
                    />
                    <BreakdownItem
                      label={lang === "uz" ? "Jarimalardan keyin" : "После штрафов"}
                      value={`${formatMoney(detailRow.grossDue, lang)} − ${formatMoney(detailRow.penalties, lang)} = ${formatMoney(detailRow.due, lang)}`}
                      strong
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <BreakdownItem label={lang === "uz" ? "Oylik stavka" : "Месячная ставка"} value={formatMoney(detailRow.staff.fixedSalary ?? 0, lang)} />
                    <BreakdownItem label={lang === "uz" ? "Davr" : "Период"} value={period} />
                    <BreakdownItem label={lang === "uz" ? "Jarimalar" : "Штрафы"} value={`-${formatMoney(detailRow.penalties, lang)}`} />
                    <BreakdownItem label={lang === "uz" ? "To'lovga" : "К выплате"} value={formatMoney(detailRow.due, lang)} strong />
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SalaryKpi({ icon: Icon, label, value, tone = "default" }: { icon: typeof BadgeDollarSign; label: string; value: string; tone?: "default" | "warning" | "success" }) {
  const toneClass = {
    default: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning-foreground",
    success: "bg-emerald-500/10 text-emerald-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}><Icon className="size-5" /></div>
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
