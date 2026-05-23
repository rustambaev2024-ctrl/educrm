import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Layers, ClipboardCheck, BookOpen, Award, Wallet, MessageSquare } from "lucide-react";
import { SidebarLayout, type NavItem } from "@/components/layouts/sidebar-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/teacher")({
  component: TeacherLayout,
});

function TeacherLayout() {
  const { t } = useI18n();
  const NAV: NavItem[] = [
    { to: "/teacher", label: t("nav.today"), icon: LayoutDashboard },
    { to: "/teacher/groups", label: t("nav.myGroups"), icon: Layers },
    { to: "/teacher/attendance", label: t("nav.attendance"), icon: ClipboardCheck },
    { to: "/teacher/homework", label: t("nav.homework"), icon: BookOpen },
    { to: "/teacher/grades", label: t("nav.grades"), icon: Award },
    { to: "/teacher/finance", label: t("nav.finance.my"), icon: Wallet },
    { to: "/teacher/messages", label: t("nav.messages"), icon: MessageSquare },
  ];
  return (
    <RoleGuard allow="teacher">
      <SidebarLayout items={NAV}>
        <Outlet />
      </SidebarLayout>
    </RoleGuard>
  );
}
