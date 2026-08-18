import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BarChart3, Building2, FileClock, Settings } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/superadmin")({
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  /** Четыре раздела — помещаются в нижнюю панель целиком. */
  const items: NavItem[] = [
    { to: "/superadmin", label: tr("Tashkilotlar", "Организации"), icon: Building2 },
    { to: "/superadmin/analytics", label: tr("Analitika", "Аналитика"), icon: BarChart3 },
    { to: "/superadmin/logs", label: tr("Loglar", "Логи"), icon: FileClock },
    { to: "/superadmin/settings", label: tr("Sozlamalar", "Настройки"), icon: Settings },
  ];

  return (
    <RoleGuard allow="superadmin">
      {/* compact: списки организаций и журналы событий. */}
      <AppShell items={items} density="compact">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
