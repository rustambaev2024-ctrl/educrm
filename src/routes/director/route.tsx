import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookOpen,
  Building,
  ClipboardList,
  Coins,
  DollarSign,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  MessageSquarePlus,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director")({
  component: DirectorLayout,
});

function DirectorLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  /* Словарь разделов — общий для директора и администратора. До
     2026-09-21 он расходился: директор звал раздел «ЛЮДИ», админ —
     «УЧЕНИКИ»; сообщения у директора жили в «СВЯЗЬ», у админа — в
     «КОНТРОЛЬ». Один и тот же экран лежал в разных смысловых ящиках,
     и договориться в разговоре было нельзя. Новые имена добавлять
     только в оба файла сразу. */
  const PEOPLE = tr("ODAMLAR", "ЛЮДИ");
  const MONEY = tr("PUL", "ДЕНЬГИ");
  /* Монеты и штрафы отделены от настоящих денег намеренно: коин —
     награда, а не выручка. Под заголовком «ДЕНЬГИ» директор читал бы
     их как доход центра. */
  const MOTIVATION = tr("RAG'BAT", "МОТИВАЦИЯ");
  const COMMS = tr("ALOQA", "ОБЩЕНИЕ");
  const REPORTS = tr("HISOBOTLAR", "ОТЧЁТЫ");
  const CENTRE = tr("MARKAZ", "ЦЕНТР");

  /**
   * Семнадцать разделов — больше всех на платформе. В нижние вкладки
   * отобрано то, ради чего директор открывает телефон между делами:
   * сводка, деньги, дневной отчёт и заявки. Всё остальное — работа
   * за столом, уходит в «Ещё».
   */
  const items: NavItem[] = [
    { to: "/director", label: tr("Boshqaruv paneli", "Панель управления"), icon: LayoutDashboard, primary: true },

    { to: "/director/leads", label: tr("Murojaatlar", "Заявки"), icon: MessageSquarePlus, section: PEOPLE, primary: true },
    { to: "/director/students", label: tr("Barcha o'quvchilar", "Все ученики"), icon: GraduationCap, section: PEOPLE },
    { to: "/director/staff", label: tr("Xodimlar", "Сотрудники"), icon: Users, section: PEOPLE },

    { to: "/director/finance", label: tr("Moliya", "Финансы"), icon: DollarSign, section: MONEY, primary: true },
    { to: "/director/salaries", label: tr("Ish haqi", "Зарплаты"), icon: BadgeDollarSign, section: MONEY },

    { to: "/director/coins", label: tr("Coinlar", "Монеты"), icon: Coins, section: MOTIVATION },
    { to: "/director/penalties", label: tr("Jarimalar va bonuslar", "Штрафы и бонусы"), icon: ShieldCheck, section: MOTIVATION },

    { to: "/director/messages", label: tr("Xabarlar", "Сообщения"), icon: MessageSquare, section: COMMS },
    { to: "/director/notifications", label: tr("Bildirishnomalar", "Уведомления"), icon: Bell, section: COMMS },

    { to: "/director/daily-report", label: tr("Kunlik hisobot", "Дневной отчёт"), icon: ClipboardList, section: REPORTS, primary: true },
    { to: "/director/analytics", label: tr("Analitika", "Аналитика"), icon: BarChart3, section: REPORTS },
    { to: "/director/audit", label: tr("Audit", "Аудит"), icon: FileClock, section: REPORTS },

    { to: "/director/courses", label: tr("Kurslar", "Курсы"), icon: BookOpen, section: CENTRE },
    { to: "/director/branches", label: tr("Filiallar", "Филиалы"), icon: Building, section: CENTRE },
    { to: "/director/integrations", label: tr("Integratsiyalar", "Интеграции"), icon: Settings, section: CENTRE },
    { to: "/director/settings", label: tr("Sozlamalar", "Настройки"), icon: Building, section: CENTRE },
  ];

  return (
    <RoleGuard allow="director">
      {/* compact: сводные таблицы по всем филиалам, зарплатам и оплатам. */}
      <AppShell items={items} density="compact">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
