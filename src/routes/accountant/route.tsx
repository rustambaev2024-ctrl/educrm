import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  DollarSign,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  ScrollText,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/accountant")({
  component: AccountantLayout,
});

function AccountantLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  /** Пять разделов — помещаются в нижнюю панель целиком. */
  const items: NavItem[] = [
    { to: "/accountant", label: tr("Boshqaruv paneli", "Панель управления"), icon: LayoutDashboard, primary: true },
    { to: "/accountant/finance", label: tr("Moliya", "Финансы"), icon: DollarSign, primary: true },
    { to: "/accountant/expenses", label: tr("Xarajatlar", "Расходы"), icon: Receipt, primary: true },
    { to: "/accountant/salaries", label: tr("Ish haqi", "Зарплаты"), icon: FileSpreadsheet, primary: true },
    { to: "/accountant/reconciliation", label: tr("Solishtiruv akti", "Акт сверки"), icon: ScrollText, primary: true },
  ];

  return (
    <RoleGuard allow="accountant">
      {/* compact: сводные таблицы платежей и расходов, тот же профиль плотности, что у director. */}
      <AppShell items={items} density="compact">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
