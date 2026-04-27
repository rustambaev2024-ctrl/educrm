import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Building2, FileClock, BarChart3, Settings } from "lucide-react";
import { SidebarLayout, type NavItem } from "@/components/layouts/sidebar-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/superadmin")({
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { t } = useI18n();
  const NAV: NavItem[] = [
    { to: "/superadmin", label: t("sa.institutions.title"), icon: Building2 },
    { to: "/superadmin/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { to: "/superadmin/logs", label: t("nav.logs"), icon: FileClock },
    { to: "/superadmin/settings", label: t("nav.settings"), icon: Settings },
  ];
  return (
    <RoleGuard allow="superadmin">
      <SidebarLayout items={NAV} brand="EduCRM Platform">
        <Outlet />
      </SidebarLayout>
    </RoleGuard>
  );
}
