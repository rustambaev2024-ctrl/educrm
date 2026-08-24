import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Award, BookOpen, Calendar, Coins, Home, MessageSquare, User } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/student")({
  component: StudentLayout,
});

function StudentLayout() {
  const { t, lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const STUDY = tr("O'QISH", "УЧЁБА");

  /**
   * Семь разделов. Раньше все семь набивались в нижнюю панель, рассчитанную
   * на пять, — подписи сминались в нечитаемое. Теперь четыре главных внизу,
   * остальные в «Ещё».
   *
   * В четвёрку отобрано то, ради чего ученик открывает приложение каждый
   * день: что сегодня, что задали, что получил. Монеты, профиль и переписка
   * — раз в несколько дней.
   */
  const items: NavItem[] = [
    { to: "/student", label: t("nav.home"), icon: Home, primary: true },

    { to: "/student/schedule", label: t("nav.schedule"), icon: Calendar, section: STUDY, primary: true },
    { to: "/student/homework", label: t("nav.homework"), icon: BookOpen, section: STUDY, primary: true },
    { to: "/student/grades", label: t("nav.grades"), icon: Award, section: STUDY, primary: true },

    { to: "/student/coins", label: tr("Coinlar", "Монеты"), icon: Coins, section: tr("GAMIFIKATSIYA", "ГЕЙМИФИКАЦИЯ") },

    { to: "/student/messages", label: t("nav.messages"), icon: MessageSquare, section: tr("BOSHQA", "ПРОЧЕЕ") },
    { to: "/student/profile", label: t("nav.profile"), icon: User, section: tr("BOSHQA", "ПРОЧЕЕ") },
  ];

  return (
    <RoleGuard allow="student">
      <AppShell items={items} density="comfortable">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
