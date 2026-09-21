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

  /* Словарь разделов — общий с директором (src/routes/director/route.tsx).
     До 2026-09-21 он расходился: здесь раздел звался «УЧЕНИКИ», у
     директора — «ЛЮДИ»; сообщения лежали в «КОНТРОЛЬ», у директора — в
     «СВЯЗЬ». Один и тот же экран в разных смысловых ящиках: два человека
     смотрели в одно место и называли его разными словами. Новые имена
     добавлять только в оба файла сразу. */
  const PEOPLE = tr("ODAMLAR", "ЛЮДИ");
  const STUDY = tr("O'QUV", "УЧЁБА");
  const MONEY = tr("PUL", "ДЕНЬГИ");
  /* Монеты и штрафы отделены от настоящих денег намеренно: коин —
     награда, а не выручка. */
  const MOTIVATION = tr("RAG'BAT", "МОТИВАЦИЯ");
  const COMMS = tr("ALOQA", "ОБЩЕНИЕ");
  const REPORTS = tr("HISOBOTLAR", "ОТЧЁТЫ");

  /**
   * Четырнадцать разделов. В нижние вкладки отобрано то, что админ трогает
   * каждый день: сводка дня, ученики, заявки и деньги. Остальное — реже
   * чем ежедневно, уходит в «Ещё».
   */
  const items: NavItem[] = [
    { to: "/admin", label: tr("Bugun", "Сегодня"), icon: LayoutDashboard, primary: true },

    { to: "/admin/leads", label: tr("Murojaatlar", "Заявки"), icon: MessageSquarePlus, section: PEOPLE, primary: true },
    { to: "/admin/students", label: tr("Barcha o'quvchilar", "Все ученики"), icon: Users, section: PEOPLE, primary: true },
    { to: "/admin/accounts", label: tr("Akkauntlar", "Аккаунты"), icon: KeyRound, section: PEOPLE },

    { to: "/admin/groups", label: tr("Guruhlar", "Группы"), icon: Layers, section: STUDY },
    { to: "/admin/schedule", label: tr("Dars jadvali", "Расписание"), icon: Calendar, section: STUDY },
    { to: "/admin/quizzes", label: tr("Testlar", "Тесты"), icon: ClipboardCheck, section: STUDY },

    /* Подпись была «Umumiy» / «Финансы» — узбекская половина означала
       «Общий» и не называла ничего. Теперь обе половины про одно. */
    { to: "/admin/finance", label: tr("Moliya", "Финансы"), icon: DollarSign, section: MONEY, primary: true },

    { to: "/admin/coins", label: tr("Coinlar", "Монеты"), icon: Coins, section: MOTIVATION },
    /* Тот же экран, что «Jarimalar va bonuslar» у директора: один
       компонент NazoratPage. Раньше здесь он звался «Nazorat» —
       заголовок совпадал с именем секции и ничего не объяснял. */
    { to: "/admin/control", label: tr("Jarimalar va bonuslar", "Штрафы и бонусы"), icon: ShieldCheck, section: MOTIVATION },

    { to: "/admin/messages", label: tr("Xabarlar", "Сообщения"), icon: MessageSquare, section: COMMS },
    { to: "/admin/notifications", label: tr("Bildirishnomalar", "Уведомления"), icon: Bell, section: COMMS },

    { to: "/admin/daily-report", label: tr("Kunlik hisobot", "Дневной отчёт"), icon: ClipboardList, section: REPORTS },
    { to: "/admin/analytics", label: tr("Analitika", "Аналитика"), icon: BarChart3, section: REPORTS },
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
