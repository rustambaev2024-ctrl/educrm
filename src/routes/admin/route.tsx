import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, GraduationCap, Layers, Calendar, Wallet, BarChart3, KeyRound, MessageSquarePlus, ShieldCheck, ClipboardList, MessageSquare } from "lucide-react";
import { SidebarLayout, type NavItem } from "@/components/layouts/sidebar-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useI18n();
  const NAV: NavItem[] = [
    { to: "/admin", label: t("nav.dashboard"), icon: LayoutDashboard },
    { to: "/admin/students", label: t("nav.students"), icon: GraduationCap },
    { to: "/admin/leads", label: t("nav.leads"), icon: MessageSquarePlus },
    { to: "/admin/accounts", label: "Akkauntlar", icon: KeyRound },
    { to: "/admin/groups", label: t("nav.groups"), icon: Layers },
    { to: "/admin/schedule", label: t("nav.schedule"), icon: Calendar },
    { to: "/admin/finance", label: t("nav.finance"), icon: Wallet },
    { to: "/admin/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { to: "/admin/daily-report", label: "Kunlik hisobot", icon: ClipboardList },
    { to: "/admin/control", label: "Nazorat", icon: ShieldCheck },
    { to: "/admin/messages", label: t("nav.messages"), icon: MessageSquare },
  ];
  return (
    <RoleGuard allow="admin">
      <SidebarLayout items={NAV}>
        <Outlet />
      </SidebarLayout>
    </RoleGuard>
  );
}
