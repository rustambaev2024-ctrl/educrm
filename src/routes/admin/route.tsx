import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Coins,
  DollarSign,
  KeyRound,
  Layers,
  LayoutDashboard,
  MessageSquare,
  MessageSquarePlus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const STUDENTS = tr("O'QUVCHILAR", "УЧЕНИКИ");
  const GROUPS = tr("GURUHLAR", "ГРУППЫ");
  const FINANCE = tr("MOLIYA", "ФИНАНСЫ");
  const REPORTS = tr("HISOBOTLAR", "ОТЧЁТЫ");
  const CONTROL = tr("NAZORAT", "КОНТРОЛЬ");

  /**
   * Четырнадцать разделов. В нижние вкладки отобрано то, что админ трогает
   * каждый день: сводка дня, ученики, заявки и деньги. Остальное — реже
   * чем ежедневно, уходит в «Ещё».
   */
  const items: NavItem[] = [
    { to: "/admin", label: tr("Bugun", "Сегодня"), icon: LayoutDashboard, primary: true },

    { to: "/admin/students", label: tr("Barcha o'quvchilar", "Все ученики"), icon: Users, section: STUDENTS, primary: true },
    { to: "/admin/leads", label: tr("Murojaatlar", "Заявки"), icon: MessageSquarePlus, section: STUDENTS, primary: true },
    { to: "/admin/accounts", label: tr("Akkauntlar", "Аккаунты"), icon: KeyRound, section: STUDENTS },
    { to: "/admin/quizzes", label: tr("Testlar", "Тесты"), icon: ClipboardCheck, section: STUDENTS },

    { to: "/admin/groups", label: tr("Guruhlar", "Группы"), icon: Layers, section: GROUPS },
    { to: "/admin/schedule", label: tr("Dars jadvali", "Расписание"), icon: Calendar, section: GROUPS },

    { to: "/admin/finance", label: tr("Umumiy", "Финансы"), icon: DollarSign, section: FINANCE, primary: true },

    { to: "/admin/daily-report", label: tr("Kunlik hisobot", "Дневной отчёт"), icon: ClipboardList, section: REPORTS },
    { to: "/admin/analytics", label: tr("Analitika", "Аналитика"), icon: BarChart3, section: REPORTS },

    { to: "/admin/coins", label: tr("Coinlar", "Монеты"), icon: Coins, section: tr("GAMIFIKATSIYA", "ГЕЙМИФИКАЦИЯ") },

    { to: "/admin/control", label: tr("Nazorat", "Контроль"), icon: ShieldCheck, section: CONTROL },
    { to: "/admin/notifications", label: tr("Bildirishnomalar", "Уведомления"), icon: Bell, section: CONTROL },
    { to: "/admin/messages", label: tr("Xabarlar", "Сообщения"), icon: MessageSquare, section: CONTROL },
  ];

  return (
    <RoleGuard allow={["admin", "branch_admin"]}>
      {/* compact: на экране бывает 1000+ учеников и финансовые таблицы,
          где воздух мешает работать. */}
      <AppShell items={items} density="compact">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
