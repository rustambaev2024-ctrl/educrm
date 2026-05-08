import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, AlertTriangle, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { PaymentMethod } from "@/lib/data/types";

export const Route = createFileRoute("/admin/finance")({ component: FinancePage });

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "click", "payme"];

function FinancePage() {
  const { t, lang } = useI18n();
  const { payments, invoices, students, groups } = useData();
  const [payOpen, setPayOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthPayments = payments.filter((p) => new Date(p.date) >= monthStart);
  const monthIncome = monthPayments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const monthExpense = monthPayments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const totalDebt = invoices
    .filter((i) => i.status === "overdue" || i.status === "partial")
    .reduce((s, i) => s + (i.amount - i.paidAmount), 0);
  const totalPending = invoices
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + (i.amount - i.paidAmount), 0);

  const incomingPayments = [...payments].filter((p) => p.direction === "in").sort((a, b) => b.date.localeCompare(a.date));
  const outgoingPayments = [...payments].filter((p) => p.direction === "out").sort((a, b) => b.date.localeCompare(a.date));
  const debtors = invoices
    .filter((i) => i.status === "overdue" || i.status === "partial")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allInvoices = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <PageHeader
        title={t("finance.title")}
        description={t("finance.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setExpenseOpen(true)}>
              <TrendingDown className="mr-1 size-4" /> {t("finance.addExpense")}
            </Button>
            <Button onClick={() => setPayOpen(true)}>
              <Plus className="mr-1 size-4" /> {t("finance.addPayment")}
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-4 md:p-8">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard tone="success" icon={TrendingUp} label={t("finance.kpi.income")} value={formatMoney(monthIncome, lang)} />
          <KpiCard tone="destructive" icon={TrendingDown} label={t("finance.kpi.expense")} value={formatMoney(monthExpense, lang)} />
          <KpiCard tone="primary" icon={Wallet} label={t("finance.kpi.profit")} value={formatMoney(monthIncome - monthExpense, lang)} />
          <KpiCard tone="warning" icon={AlertTriangle} label={t("finance.kpi.debt")} value={formatMoney(totalDebt + totalPending, lang)} />
        </div>

        <Tabs defaultValue="payments">
          <TabsList>
            <TabsTrigger value="payments">{t("finance.tab.payments")}</TabsTrigger>
            <TabsTrigger value="invoices">{t("finance.tab.invoices")}</TabsTrigger>
            <TabsTrigger value="debtors">
              {t("finance.tab.debtors")}
              {debtors.length > 0 && <Badge className="ml-2 h-4 min-w-4 px-1 text-[10px]">{debtors.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="expenses">{t("finance.tab.expenses")}</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="mt-4">
            <Card className="overflow-hidden shadow-elegant">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance.col.student")}</TableHead>
                    <TableHead>{t("finance.col.group")}</TableHead>
                    <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
                    <TableHead>{t("finance.col.method")}</TableHead>
                    <TableHead>{t("finance.col.date")}</TableHead>
                    <TableHead>{t("finance.col.comment")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomingPayments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        {t("finance.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {incomingPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.studentId ? studentById[p.studentId]?.fullName : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.groupId ? groupById[p.groupId]?.name : "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-success">+{formatMoney(p.amount, lang)}</TableCell>
                      <TableCell><Badge variant="outline">{t(`finance.method.${p.method}`)}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(p.date, lang)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.comment ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            <Card className="overflow-hidden shadow-elegant">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance.col.student")}</TableHead>
                    <TableHead>{t("finance.col.group")}</TableHead>
                    <TableHead>{t("finance.col.period")}</TableHead>
                    <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
                    <TableHead>{t("finance.col.due")}</TableHead>
                    <TableHead>{t("finance.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{studentById[inv.studentId]?.fullName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{groupById[inv.groupId]?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{inv.period}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(inv.paidAmount, lang)}
                        <span className="text-muted-foreground"> / {formatMoney(inv.amount, lang)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(inv.dueDate, lang)}</TableCell>
                      <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="debtors" className="mt-4">
            {debtors.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 p-12 text-center shadow-elegant">
                <div className="flex size-12 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Wallet className="size-6" />
                </div>
                <div className="text-base font-semibold">{t("finance.emptyDebtors")}</div>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {debtors.map((inv) => {
                  const due = inv.amount - inv.paidAmount;
                  return (
                    <Card key={inv.id} className="flex items-center gap-3 p-4 shadow-elegant">
                      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                        <AlertTriangle className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{studentById[inv.studentId]?.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">{groupById[inv.groupId]?.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-destructive">{formatMoney(due, lang)}</div>
                        <div className="text-[10px] text-muted-foreground">{formatDate(inv.dueDate, lang)}</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="expenses" className="mt-4">
            <Card className="overflow-hidden shadow-elegant">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance.col.category")}</TableHead>
                    <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
                    <TableHead>{t("finance.col.method")}</TableHead>
                    <TableHead>{t("finance.col.date")}</TableHead>
                    <TableHead>{t("finance.col.comment")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outgoingPayments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        {t("finance.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {outgoingPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.category ? t(`finance.cat.${p.category}`) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">−{formatMoney(p.amount, lang)}</TableCell>
                      <TableCell><Badge variant="outline">{t(`finance.method.${p.method}`)}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(p.date, lang)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.comment ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
    </>
  );
}

function KpiCard({ tone, icon: Icon, label, value }: {
  tone: "success" | "destructive" | "primary" | "warning";
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  const tones = {
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-gradient-primary text-primary-foreground",
    warning: "bg-warning/15 text-warning-foreground",
  };
  return (
    <Card className="p-5 shadow-elegant">
      <div className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function PaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useI18n();
  const { students, groups, branches, addPayment, invoices, applyInvoicePayment } = useData();
  const [studentId, setStudentId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [comment, setComment] = useState("");

  const reset = () => {
    setStudentId("");
    setGroupId("");
    setAmount("");
    setMethod("cash");
    setComment("");
  };

  const handleSave = () => {
    const num = Number(amount);
    if (!studentId || !num || num <= 0) {
      toast.error(t("validation.fillAll"));
      return;
    }
    const student = students.find((s) => s.id === studentId);
    addPayment({
      studentId,
      groupId: groupId || undefined,
      branchId: student?.branchId ?? branches[0]?.id ?? "b1",
      amount: num,
      direction: "in",
      method,
      date: new Date().toISOString(),
      comment: comment || undefined,
      category: "tuition",
    });
    // Apply to oldest unpaid invoice for this student
    const studentInvoice = invoices
      .filter((i) => i.studentId === studentId && i.status !== "paid")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (studentInvoice) applyInvoicePayment(studentInvoice.id, num);
    toast.success(t("finance.received"));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("finance.addPayment")}</DialogTitle>
          <DialogDescription>{formatDate(new Date().toISOString(), lang)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.student")} *</Label>
            <Select value={studentId} onValueChange={(v) => { setStudentId(v); const st = students.find((s) => s.id === v); setGroupId(st?.groupIds[0] ?? ""); }}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {students.filter((s) => s.status !== "archived").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {studentId && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("finance.col.group")}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {students.find((s) => s.id === studentId)?.groupIds.map((gid) => {
                    const g = groups.find((x) => x.id === gid);
                    return g ? <SelectItem key={gid} value={gid}>{g.name}</SelectItem> : null;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("finance.col.amount")} *</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="600000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("finance.col.method")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{t(`finance.method.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.comment")}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const { branches, addPayment } = useData();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [category, setCategory] = useState<"salary" | "rent" | "utilities" | "marketing" | "other">("rent");
  const [comment, setComment] = useState("");

  const handleSave = () => {
    const num = Number(amount);
    if (!num || num <= 0) {
      toast.error(t("validation.fillAll"));
      return;
    }
    addPayment({
      branchId: branches[0]?.id ?? "b1",
      amount: num,
      direction: "out",
      method,
      date: new Date().toISOString(),
      comment: comment || undefined,
      category,
    });
    toast.success(t("finance.expenseAdded"));
    setAmount(""); setComment(""); setCategory("rent"); setMethod("transfer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("finance.addExpense")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.category")}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["salary", "rent", "utilities", "marketing", "other"] as const).map((c) => (
                  <SelectItem key={c} value={c}>{t(`finance.cat.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("finance.col.amount")} *</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("finance.col.method")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{t(`finance.method.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.comment")}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// silence unused — `Receipt` only used for icon palette consistency
void Receipt;
