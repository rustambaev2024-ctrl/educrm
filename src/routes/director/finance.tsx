import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
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
import { formatDate, formatMoney, getLocalDateString } from "@/lib/format";

export const Route = createFileRoute("/director/finance")({ component: DirectorFinancePage });

function DirectorFinancePage() {
  const { t, lang } = useI18n();
  const { payments, students, branches, reversePayment, isLoading } = useData();

  const [walletsLimit, setWalletsLimit] = useState(50);

  const handleReversePayment = async (paymentId: string, amount: number) => {
    const confirmed = window.confirm(
      lang === "uz"
        ? `${formatMoney(amount, lang)} miqdordagi to'lovni bekor qilishni tasdiqlaysizmi?`
        : `Подтвердите отмену платежа на сумму ${formatMoney(amount, lang)}`,
    );
    if (!confirmed) return;
    try {
      await reversePayment(paymentId);
      toast.success(lang === "uz" ? "To'lov bekor qilindi" : "Платёж отменён");
    } catch {
      toast.error(lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка");
    }
  };

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return getLocalDateString(d);
  });
  const [dateTo, setDateTo] = useState(() => getLocalDateString());

  const fromTime = new Date(dateFrom).getTime();
  const toTime = new Date(dateTo).getTime() + 86400000;
  const monthPayments = payments.filter((p) => {
    const pt = new Date(p.date).getTime();
    return pt >= fromTime && pt < toTime;
  });
  const income = monthPayments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const expense = monthPayments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const debt = students
    .filter((s) => s.balance < 0)
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
      // Последний платёж — из ВСЕХ платежей, независимо от выбранного периода
      const allStudentPayments = payments.filter(p => p.studentId === s.id && p.direction === "in");
      allStudentPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastPayment = allStudentPayments[0];

      return {
        ...s,
        lastPaymentDate: lastPayment ? lastPayment.date : null,
        lastPaymentAmount: lastPayment ? lastPayment.amount : null,
      };
    });
  }, [students, payments]);

  const visibleWallets = wallets.slice(0, walletsLimit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={t("finance.title")}
      subtitle={t("finance.directorSubtitle")}
      actions={
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
          <span>-</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard iconColor="green" icon={TrendingUp} label={t("finance.kpi.income")} value={formatMoney(income, lang)} />
          <KpiCard iconColor="red" icon={TrendingDown} label={t("finance.kpi.expense")} value={formatMoney(expense, lang)} />
          <KpiCard iconColor="violet" icon={Wallet} label={t("finance.kpi.profit")} value={formatMoney(income - expense, lang)} />
          <KpiCard iconColor="amber" icon={AlertTriangle} label={t("finance.kpi.debt")} value={formatMoney(debt, lang)} />
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
          <div className="mb-4 text-sm font-semibold">{lang === "uz" ? "Hamyonlar" : "Кошельки"}</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance.col.student")}</TableHead>
                  <TableHead>{t("finance.col.phone")}</TableHead>
                  <TableHead>{t("finance.col.status")}</TableHead>
                  <TableHead className="text-right">{t("finance.col.balance")}</TableHead>
                  <TableHead className="text-right">{lang === "uz" ? "Oxirgi to'lov" : "Последний платёж"}</TableHead>
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
                {visibleWallets.map((w) => (
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
          {wallets.length > walletsLimit && (
            <button
              onClick={() => setWalletsLimit((l) => l + 50)}
              className="w-full border-t py-2 text-sm text-[#0077b6] hover:bg-[#f0f9ff]"
            >
              {lang === "uz"
                ? `Yana ${wallets.length - walletsLimit} ta ko'rsatish`
                : `Показать ещё ${wallets.length - walletsLimit}`}
            </button>
          )}
        </Card>

        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">{t("finance.tab.payments")}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.col.date")}</TableHead>
                <TableHead>{lang === "uz" ? "Tur" : "Тип"}</TableHead>
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
                    <PaymentTypeBadge type={p.type} lang={lang} />
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
                    {["manual_charge", "manual_top_up", "top_up"].includes(p.type) && (
                      <Button variant="ghost" size="icon" onClick={() => handleReversePayment(p.id, p.amount)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
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
    </PageShell>
  );
}

function PaymentTypeBadge({ type, lang }: { type: string; lang: "uz" | "ru" }) {
  const map: Record<string, { uz: string; ru: string; className: string }> = {
    top_up: { uz: "To'lov", ru: "Пополнение", className: "bg-success/15 text-success border-success/30" },
    charge: { uz: "Dars uchun", ru: "За урок", className: "bg-info/15 text-info border-info/30" },
    manual_charge: { uz: "Yechish", ru: "Списание", className: "bg-destructive/15 text-destructive border-destructive/30" },
    manual_top_up: { uz: "Qo'shish", ru: "Зачисление", className: "bg-success/15 text-success border-success/30" },
    refund: { uz: "Qaytarish", ru: "Возврат", className: "bg-warning/15 text-warning border-warning/30" },
    discount: { uz: "Chegirma", ru: "Скидка", className: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
    expense: { uz: "Xarajat", ru: "Расход", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const info = map[type];
  const label = info ? (lang === "uz" ? info.uz : info.ru) : type;
  const className = info?.className ?? "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`text-[10px] ${className}`}>{label}</Badge>;
}
