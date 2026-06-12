import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Home, Calendar, BookOpen, User, Award, MessageSquare, Coins } from "lucide-react";
import { MobileLayout, type MobileNavItem } from "@/components/layouts/mobile-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/student")({
  component: StudentLayout,
});

function StudentLayout() {
  const { t, lang } = useI18n();
  const NAV: MobileNavItem[] = [
    { to: "/student", label: t("nav.home"), icon: Home },
    { to: "/student/schedule", label: t("nav.schedule"), icon: Calendar },
    { to: "/student/homework", label: t("nav.homework"), icon: BookOpen },
    { to: "/student/grades", label: t("nav.grades"), icon: Award },
    { to: "/student/coins", label: lang === "uz" ? "Coinlar" : "Монеты", icon: Coins },
    { to: "/student/profile", label: t("nav.profile"), icon: User },
    { to: "/student/messages", label: t("nav.messages"), icon: MessageSquare },
  ];
  return (
    <RoleGuard allow="student">
      <MobileLayout items={NAV}>
        <Outlet />
      </MobileLayout>
    </RoleGuard>
  );
}
