import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Home, MessageSquare, User, Users } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/parent")({
  component: ParentLayout,
});

function ParentLayout() {
  const { t } = useI18n();

  /** Четыре раздела — помещаются в нижнюю панель целиком, «Ещё» не нужно. */
  const items: NavItem[] = [
    { to: "/parent", label: t("nav.home"), icon: Home },
    { to: "/parent/children", label: t("nav.children"), icon: Users },
    { to: "/parent/messages", label: t("nav.messages"), icon: MessageSquare },
    { to: "/parent/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <RoleGuard allow="parent">
      <AppShell items={items} density="comfortable">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
