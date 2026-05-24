import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/director/finance")({ component: DirectorFinancePage });

function DirectorFinancePage() {
  const { t, lang } = useI18n();
  const { payments, students, branches, reversePayment, isLoading } = useData();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const fromTime = new Date(dateFrom).getTime();
  const toTime = new Date(dateTo).getTime() + 86400000;
  const monthPayments = payments.filter((p) => {
    const pt = new Date(p.date).getTime();
    return pt >= fromTime && pt < toTime;
  });
  const income = monthPayments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const expense = monthPayments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const debt = students
    .filter((s) => s.status === "debtor")
    .reduce((s, st) => s + Math.abs(st.balance), 0);

  // Per-branch breakdown
  const perBranch = useMemo(
    () =>
      branches.map((b) => {
        const bp = monthPayments.filter((p) => p.branchId === b.id);
        const bIncome = bp.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
        const bExpense = bp.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
        return { branch: b, income: bIncome, expense: bExpense, profit: bIncome - bExpense };
      }),
    [branches, monthPayments],
  );

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    monthPayments.filter((p) => p.direction === "out").forEach((p) => {
      const key = p.category ?? "other";
      map.set(key, (map.get(key) ?? 0) + p.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthPayments]);

  const maxBranchValue = Math.max(...perBranch.map((b) => Math.max(b.income, b.expense)), 1);

  const wallets = useMemo(() => {
    return students.map(s => {
      const studentPayments = monthPayments.filter(p => p.studentId === s.id && p.direction === "in");
      studentPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastPayment = studentPayments[0];
      
      return {
        ...s,
        lastPaymentDate: lastPayment ? lastPayment.date : null,
        lastPaymentAmount: lastPayment ? lastPayment.amount : null,
      };
    });
  }, [students, monthPayments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("finance.title")} description={t("finance.directorSubtitle")} />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 px-4 md:px-8 pt-4">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
          <span>-</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
        </div>
      </div>

      <div className="space-y-6 p-4 md:p-8 pt-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi tone="success" icon={TrendingUp} label={t("finance.kpi.income")} value={formatMoney(income, lang)} />
          <Kpi tone="destructive" icon={TrendingDown} label={t("finance.kpi.expense")} value={formatMoney(expense, lang)} />
          <Kpi tone="primary" icon={Wallet} label={t("finance.kpi.profit")} value={formatMoney(income - expense, lang)} />
          <Kpi tone="warning" icon={AlertTriangle} label={t("finance.kpi.debt")} value={formatMoney(debt, lang)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 shadow-elegant">
            <div className="mb-4 text-sm font-semibold">{t("nav.branches")}</div>
            <div className="space-y-3">
              {perBranch.map((b) => (
                <div key={b.branch.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{b.branch.name}</div>
                    <div className="text-sm font-bold">{formatMoney(b.profit, lang)}</div>
                  </div>
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-success" style={{ width: `${(b.income / maxBranchValue) * 50}%` }} />
                    <div className="h-full bg-destructive/70" style={{ width: `${(b.expense / maxBranchValue) * 50}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="text-success">+{formatMoney(b.income, lang)}</span>
                    <span className="text-destructive">−{formatMoney(b.expense, lang)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 shadow-elegant">
            <div className="mb-4 text-sm font-semibold">{t("finance.tab.expenses")}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance.col.category")}</TableHead>
                  <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseByCategory.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">{t("finance.empty")}</TableCell></TableRow>
                )}
                {expenseByCategory.map(([cat, amount]) => (
                  <TableRow key={cat}>
                    <TableCell><Badge variant="outline">{t(`finance.cat.${cat}`)}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(amount, lang)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {expense > 0 ? `${Math.round((amount / expense) * 100)}%` : "0%"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4 text-sm font-semibold">Wallets</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance.col.student")}</TableHead>
                  <TableHead>{t("finance.col.phone")}</TableHead>
                  <TableHead>{t("finance.col.status")}</TableHead>
                  <TableHead className="text-right">{t("finance.col.balance")}</TableHead>
                  <TableHead className="text-right">Last Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {t("finance.empty")}
                    </TableCell>
                  </TableRow>
                )}
                {wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{w.phone}</TableCell>
                    <TableCell><Badge variant={w.status === "debtor" ? "destructive" : "outline"}>{t(`status.${w.status}`)}</Badge></TableCell>
                    <TableCell className={`text-right font-semibold ${w.balance < 0 ? 'text-destructive' : 'text-success'}`}>{formatMoney(w.balance, lang)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {w.lastPaymentDate ? `${formatDate(w.lastPaymentDate, lang)} (+${formatMoney(w.lastPaymentAmount || 0, lang)})` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">{t("finance.tab.payments")}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.col.date")}</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>{t("finance.col.category")}</TableHead>
                <TableHead>{t("nav.branches")}</TableHead>
                <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(p.date, lang)}</TableCell>
                  <TableCell>
                    <PaymentTypeBadge type={p.type} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.category ? t(`finance.cat.${p.category}`) : "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {branches.find((b) => b.id === p.branchId)?.name}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${p.direction === "in" ? "text-success" : p.direction === "out" ? "text-destructive" : "text-muted-foreground"}`}>
                    {p.direction === "in" ? "+" : p.direction === "out" ? "−" : ""}{formatMoney(p.amount, lang)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.type !== 'refund' && (
                      <Button variant="ghost" size="icon" onClick={() => reversePayment(p.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <RotateCcw className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function Kpi({ tone, icon: Icon, label, value }: {
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

function PaymentTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    top_up: { label: "To'lov", className: "bg-success/15 text-success border-success/30" },
    charge: { label: "Dars", className: "bg-info/15 text-info border-info/30" },
    manual_charge: { label: "Qo'lda yechish", className: "bg-destructive/15 text-destructive border-destructive/30" },
    manual_top_up: { label: "Qo'lda kirim", className: "bg-success/15 text-success border-success/30" },
    refund: { label: "Qaytarish", className: "bg-warning/15 text-warning border-warning/30" },
    discount: { label: "Chegirma", className: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
    expense: { label: "Xarajat", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const info = map[type] ?? { label: type, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`text-[10px] ${info.className}`}>{info.label}</Badge>;
}
