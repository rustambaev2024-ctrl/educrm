import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Home, Users, User, MessageSquare } from "lucide-react";
import { MobileLayout, type MobileNavItem } from "@/components/layouts/mobile-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/parent")({
  component: ParentLayout,
});

function ParentLayout() {
  const { t } = useI18n();
  const NAV: MobileNavItem[] = [
    { to: "/parent", label: t("nav.home"), icon: Home },
    { to: "/parent/children", label: t("nav.children"), icon: Users },
    { to: "/parent/profile", label: t("nav.profile"), icon: User },
    { to: "/parent/messages", label: t("nav.messages"), icon: MessageSquare },
  ];
  return (
    <RoleGuard allow="parent">
      <MobileLayout items={NAV}>
        <Outlet />
      </MobileLayout>
    </RoleGuard>
  );
}
