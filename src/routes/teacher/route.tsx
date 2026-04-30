import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Layers, ClipboardCheck, BookOpen, Award } from "lucide-react";
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
  ];
  return (
    <RoleGuard allow="teacher">
      <SidebarLayout items={NAV}>
        <Outlet />
      </SidebarLayout>
    </RoleGuard>
  );
}
