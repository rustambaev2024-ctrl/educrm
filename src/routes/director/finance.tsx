import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const { payments, invoices, branches } = useData();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthPayments = payments.filter((p) => new Date(p.date) >= monthStart);
  const income = monthPayments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const expense = monthPayments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const debt = invoices
    .filter((i) => i.status === "overdue" || i.status === "partial")
    .reduce((s, i) => s + (i.amount - i.paidAmount), 0);

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

  return (
    <>
      <PageHeader title={t("finance.title")} description={t("finance.directorSubtitle")} />
      <div className="space-y-6 p-4 md:p-8">
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

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">{t("finance.tab.payments")}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.col.date")}</TableHead>
                <TableHead>{t("finance.col.category")}</TableHead>
                <TableHead>{t("nav.branches")}</TableHead>
                <TableHead className="text-right">{t("finance.col.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(p.date, lang)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.category ? t(`finance.cat.${p.category}`) : "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {branches.find((b) => b.id === p.branchId)?.name}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${p.direction === "in" ? "text-success" : p.direction === "out" ? "text-destructive" : "text-muted-foreground"}`}>
                    {p.direction === "in" ? "+" : p.direction === "out" ? "−" : ""}{formatMoney(p.amount, lang)}
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
