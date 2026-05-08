import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, CalendarDays, CreditCard, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { PaymentMethod } from "@/lib/data/types";

export const Route = createFileRoute("/director/salaries")({ component: DirectorSalaries });

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "click", "payme"];

function DirectorSalaries() {
  const { t, lang } = useI18n();
  const { staff, groups, payments, branches, addPayment } = useData();
  const activeStaff = staff.filter((item) => item.role !== "director");
  const [staffId, setStaffId] = useState(() => activeStaff[0]?.id ?? "");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [fixedSalary, setFixedSalary] = useState("2000000");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const selected = activeStaff.find((item) => item.id === staffId);
  const monthStart = new Date(`${period}-01T00:00:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const calculation = useMemo(() => {
    if (!selected) return { base: 0, due: 0, paid: 0, remaining: 0, percent: 0 };
    const groupIds = new Set(groups.filter((group) => group.teacherId === selected.id).map((group) => group.id));
    const inPeriod = payments.filter((payment) => {
      const ts = new Date(payment.date).getTime();
      return ts >= monthStart.getTime() && ts < monthEnd.getTime();
    });
    const teacherBase = inPeriod
      .filter((payment) => payment.direction === "in" && payment.groupId && groupIds.has(payment.groupId))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const percent = selected.role === "teacher" ? selected.salaryPercent ?? 40 : 0;
    const due = selected.role === "teacher" ? Math.round((teacherBase * percent) / 100) : Number(fixedSalary) || 0;
    const paid = inPeriod
      .filter((payment) => payment.direction === "out" && payment.category === "salary" && payment.staffId === selected.id)
      .reduce((sum, payment) => sum + payment.amount, 0);
    return { base: teacherBase, due, paid, remaining: Math.max(due - paid, 0), percent };
  }, [fixedSalary, groups, monthEnd, monthStart, payments, selected]);

  const salaryHistory = payments
    .filter((payment) => payment.direction === "out" && payment.category === "salary")
    .sort((a, b) => b.date.localeCompare(a.date));

  const savePayout = () => {
    if (!selected) return;
    const payout = Number(amount);
    if (!payout || payout <= 0) return;
    addPayment({
      staffId: selected.id,
      branchId: selected.branchId ?? branches[0]?.id ?? "",
      amount: payout,
      direction: "out",
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
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="p-4 shadow-elegant lg:col-span-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{lang === "uz" ? "Xodim" : "Сотрудник"}</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    {activeStaff.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.fullName} - {item.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{lang === "uz" ? "Oy" : "Месяц"}</Label>
                  <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                {selected?.role !== "teacher" && (
                  <div className="space-y-1.5">
                    <Label>{lang === "uz" ? "Belgilangan oylik" : "Фиксированная зарплата"}</Label>
                    <Input type="number" min={0} step={1000} value={fixedSalary} onChange={(e) => setFixedSalary(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <SalaryKpi icon={BadgeDollarSign} label={lang === "uz" ? "Hisoblangan" : "Начислено"} value={formatMoney(calculation.due, lang)} />
          <SalaryKpi icon={CreditCard} label={lang === "uz" ? "Qoldiq" : "Остаток"} value={formatMoney(calculation.remaining, lang)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-4 p-4 shadow-elegant lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4" /> {selected?.fullName ?? "-"}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label={lang === "uz" ? "Lavozim" : "Должность"} value={selected?.role ?? "-"} />
              <Info label={lang === "uz" ? "Foiz" : "Процент"} value={selected?.role === "teacher" ? `${calculation.percent}%` : "-"} />
              <Info label={lang === "uz" ? "To'langan" : "Выплачено"} value={formatMoney(calculation.paid, lang)} />
            </div>
            {selected?.role === "teacher" && (
              <Card className="bg-muted/30 p-3 text-sm text-muted-foreground">
                {lang === "uz" ? "O'qituvchi ulushi" : "Доля учителя"}: {formatMoney(calculation.base, lang)} x {calculation.percent}% = {formatMoney(calculation.due, lang)}
              </Card>
            )}
          </Card>

          <Card className="space-y-3 p-4 shadow-elegant">
            <div className="text-sm font-semibold">{lang === "uz" ? "To'lov berish" : "Выдать выплату"}</div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Summa" : "Сумма"}</Label>
              <Input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(calculation.remaining || calculation.due)} />
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Usul" : "Способ"}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((item) => <SelectItem key={item} value={item}>{t(`finance.method.${item}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={savePayout}>{lang === "uz" ? "To'lovni saqlash" : "Сохранить выплату"}</Button>
          </Card>
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">{lang === "uz" ? "To'lovlar tarixi" : "История выплат"}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "uz" ? "Xodim" : "Сотрудник"}</TableHead>
                <TableHead>{lang === "uz" ? "Sana" : "Дата"}</TableHead>
                <TableHead>{lang === "uz" ? "Usul" : "Способ"}</TableHead>
                <TableHead className="text-right">{lang === "uz" ? "Summa" : "Сумма"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaryHistory.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</TableCell></TableRow>
              ) : salaryHistory.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{staff.find((item) => item.id === payment.staffId)?.fullName ?? payment.comment ?? "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(payment.date, lang)}</TableCell>
                  <TableCell>{t(`finance.method.${payment.method}`)}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive">-{formatMoney(payment.amount, lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function SalaryKpi({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <Card className="p-4 shadow-elegant">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="size-5" /></div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/30 p-3"><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
