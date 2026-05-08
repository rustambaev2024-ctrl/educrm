import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, CalendarDays, CreditCard, UserRound, Percent, Briefcase } from "lucide-react";
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
import type { PaymentMethod } from "@/lib/data/types";

export const Route = createFileRoute("/director/salaries")({ component: DirectorSalaries });

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "click", "payme"];

function DirectorSalaries() {
  const { t, lang } = useI18n();
  const { staff, groups, payments, branches, addPayment } = useData();
  const activeStaff = staff.filter((item) => item.role !== "director");
  const [staffId, setStaffId] = useState(() => activeStaff[0]?.id ?? "");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const selected = activeStaff.find((item) => item.id === staffId);
  const monthStart = new Date(`${period}-01T00:00:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const isTeacher = selected?.role === "teacher";

  const calculation = useMemo(() => {
    if (!selected) return { base: 0, due: 0, paid: 0, remaining: 0, percent: 0 };
    const groupIds = new Set(groups.filter((group) => group.teacherId === selected.id).map((group) => group.id));
    const inPeriod = payments.filter((payment) => {
      const ts = new Date(payment.date).getTime();
      return ts >= monthStart.getTime() && ts < monthEnd.getTime();
    });

    let due: number;
    let base = 0;
    let percent = 0;

    if (isTeacher) {
      // Teacher: percentage of collected tuition from their groups
      base = inPeriod
        .filter((payment) => payment.direction === "in" && payment.groupId && groupIds.has(payment.groupId))
        .reduce((sum, payment) => sum + payment.amount, 0);
      percent = selected.salaryPercent ?? 40;
      due = Math.round((base * percent) / 100);
    } else {
      // Non-teacher staff: fixed monthly salary from their record
      due = selected.fixedSalary ?? 0;
    }

    const paid = inPeriod
      .filter((payment) => payment.direction === "out" && payment.category === "salary" && payment.staffId === selected.id)
      .reduce((sum, payment) => sum + payment.amount, 0);

    return { base, due, paid, remaining: Math.max(due - paid, 0), percent };
  }, [groups, monthEnd, monthStart, payments, selected, isTeacher]);

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
        {/* Calculator section */}
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="p-4 shadow-elegant lg:col-span-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{lang === "uz" ? "Xodim" : "Сотрудник"}</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    {activeStaff.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          {item.fullName}
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {item.role === "teacher"
                              ? `${item.salaryPercent ?? 40}%`
                              : item.fixedSalary
                                ? formatMoney(item.fixedSalary, lang)
                                : t(`role.${item.role}`)}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "uz" ? "Oy" : "Месяц"}</Label>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
            </div>
          </Card>

          <SalaryKpi icon={BadgeDollarSign} label={lang === "uz" ? "Hisoblangan" : "Начислено"} value={formatMoney(calculation.due, lang)} />
          <SalaryKpi icon={CreditCard} label={lang === "uz" ? "Qoldiq" : "Остаток"} value={formatMoney(calculation.remaining, lang)} />
        </div>

        {/* Details + Payout form */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-4 p-4 shadow-elegant lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4" /> {selected?.fullName ?? "-"}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Info
                label={lang === "uz" ? "Lavozim" : "Должность"}
                value={selected ? t(`role.${selected.role}`) : "-"}
              />
              <Info
                label={lang === "uz" ? "Ish haqi turi" : "Тип зарплаты"}
                value={
                  isTeacher
                    ? (lang === "uz" ? "Foizli" : "Процентная")
                    : (lang === "uz" ? "Belgilangan" : "Фиксированная")
                }
                icon={isTeacher ? <Percent className="size-3 inline mr-1" /> : <Briefcase className="size-3 inline mr-1" />}
              />
              <Info label={lang === "uz" ? "To'langan" : "Выплачено"} value={formatMoney(calculation.paid, lang)} />
            </div>

            {isTeacher ? (
              <Card className="bg-muted/30 p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  {lang === "uz" ? "Hisob-kitob formulasi" : "Формула расчёта"}
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <div>{lang === "uz" ? "O'quvchilardan tushum" : "Поступления от учеников"}: <span className="font-semibold text-foreground">{formatMoney(calculation.base, lang)}</span></div>
                  <div>{lang === "uz" ? "O'qituvchi foizi" : "Процент учителя"}: <span className="font-semibold text-foreground">{calculation.percent}%</span></div>
                  <div className="border-t border-border/40 pt-1 font-semibold text-foreground">
                    {formatMoney(calculation.base, lang)} × {calculation.percent}% = {formatMoney(calculation.due, lang)}
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="bg-muted/30 p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  {lang === "uz" ? "Belgilangan oylik" : "Фиксированная зарплата"}
                </div>
                <div className="text-foreground font-semibold">
                  {formatMoney(selected?.fixedSalary ?? 0, lang)} / {lang === "uz" ? "oy" : "мес"}
                </div>
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

        {/* Payment history table */}
        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">{lang === "uz" ? "To'lovlar tarixi" : "История выплат"}</div>
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
                          ? (lang === "uz" ? "Foizli" : "%")
                          : (lang === "uz" ? "Oylik" : "Фикс")}
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

function SalaryKpi({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <Card className="p-4 shadow-elegant">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="size-5" /></div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{icon}{value}</div>
    </div>
  );
}
