import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Building, Users, Wallet, BarChart3, FileClock, BookOpen } from "lucide-react";
import { SidebarLayout, type NavItem } from "@/components/layouts/sidebar-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director")({
  component: DirectorLayout,
});

function DirectorLayout() {
  const { t } = useI18n();
  const NAV: NavItem[] = [
    { to: "/director", label: t("nav.dashboard"), icon: LayoutDashboard },
    { to: "/director/branches", label: t("nav.branches"), icon: Building },
    { to: "/director/courses", label: "Kurslar", icon: BookOpen },
    { to: "/director/staff", label: t("nav.staff"), icon: Users },
    { to: "/director/finance", label: t("nav.finance"), icon: Wallet },
    { to: "/director/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { to: "/director/audit", label: t("nav.audit"), icon: FileClock },
  ];
  return (
    <RoleGuard allow="director">
      <SidebarLayout items={NAV}>
        <Outlet />
      </SidebarLayout>
    </RoleGuard>
  );
}
