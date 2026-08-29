import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Lock, TrendingDown, Unlock, Wallet } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { useData } from "@/lib/data/store";
import { sumIncome, sumExpense } from "@/lib/data/mappers";
import { countDebtors } from "@/lib/data/definitions";
import { periodCloseApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/accountant/")({ component: AccountantHome });

/** Сырая форма ответа API — см. PeriodCloseSerializer на бэкенде. */
interface PeriodCloseRaw {
  id: string;
  month: string;
  reopened_at: string | null;
}

function AccountantHome() {
  const { lang, plural } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const { students, payments, isLoading } = useData();

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  /** Ключ месяца в формате DateField бэкенда: всегда 1-е число. */
  const monthKey = useMemo(() => {
    const d = new Date(monthStart);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-01`;
  }, [monthStart]);

  const monthly = useMemo(() => {
    const inMonth = payments.filter((p) => new Date(p.date).getTime() >= monthStart);
    return { income: sumIncome(inMonth), expense: sumExpense(inMonth) };
  }, [payments, monthStart]);

  const debtors = countDebtors(students);

  // Статус периода тянется отдельным запросом — он не часть общего стора
  // useData(), поэтому не блокирует общий скелетон страницы. Пока грузится,
  // плитка показывает "…" вместо значения.
  const [periodStatus, setPeriodStatus] = useState<"loading" | "open" | "closed">("loading");

  useEffect(() => {
    let cancelled = false;
    periodCloseApi
      .list()
      .then((data) => {
        if (cancelled) return;
        const rows = data as PeriodCloseRaw[];
        const closed = rows.some((r) => r.month === monthKey && r.reopened_at === null);
        setPeriodStatus(closed ? "closed" : "open");
      })
      .catch((err) => {
        console.error("[accountant] period-close status fetch failed:", err);
        if (!cancelled) setPeriodStatus("open");
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  if (isLoading) {
    return (
      <PageShell
        title={tr("Boshqaruv paneli", "Панель управления")}
        subtitle={tr("Joriy oy bo'yicha moliyaviy ko'rsatkichlar", "Финансовые показатели за текущий месяц")}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={tr("Boshqaruv paneli", "Панель управления")}
      subtitle={tr("Joriy oy bo'yicha moliyaviy ko'rsatkichlar", "Финансовые показатели за текущий месяц")}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={tr("Oylik tushum", "Доход за месяц")}
          value={formatMoney(monthly.income, lang)}
          icon={Wallet}
          iconColor="green"
        />
        <KpiCard
          label={tr("Oylik xarajat", "Расход за месяц")}
          value={formatMoney(monthly.expense, lang)}
          icon={TrendingDown}
          iconColor="red"
        />
        <KpiCard
          label={tr("Qarzdorlar", "Должники")}
          value={`${debtors}`}
          subtitle={lang === "ru" ? plural(debtors, "ученик", "ученика", "учеников") : "o'quvchi"}
          icon={AlertCircle}
          iconColor="amber"
        />
        <KpiCard
          label={tr("Davr holati", "Статус периода")}
          value={
            periodStatus === "loading"
              ? "…"
              : periodStatus === "closed"
                ? tr("Yopiq", "Закрыт")
                : tr("Ochiq", "Открыт")
          }
          icon={periodStatus === "closed" ? Lock : Unlock}
          iconColor={periodStatus === "closed" ? "amber" : "green"}
        />
      </div>
    </PageShell>
  );
}
