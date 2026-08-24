import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  ClipboardCheck,
  Coins,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Wallet,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/teacher")({
  component: TeacherLayout,
});

function TeacherLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const TEACHING = tr("TA'LIM", "ОБУЧЕНИЕ");

  /**
   * Порядок задаёт и боковое меню, и нижние вкладки. Пункты одной группы
   * идут подряд — иначе группа разорвётся на две с одинаковым заголовком.
   *
   * primary — четыре вкладки внизу на телефоне. Отобраны по частоте
   * в рабочем дне учителя: открыть день → отметить посещаемость →
   * поставить оценки и задать домашку. «Мои группы» и «Тесты» — это
   * просмотр и подготовка, они уходят в «Ещё».
   */
  const items: NavItem[] = [
    { to: "/teacher", label: tr("Bugun", "Сегодня"), icon: LayoutDashboard, primary: true },

    { to: "/teacher/groups", label: tr("Mening guruhlarim", "Мои группы"), icon: Layers, section: TEACHING },
    { to: "/teacher/attendance", label: tr("Davomat", "Посещаемость"), icon: ClipboardCheck, section: TEACHING, primary: true },
    { to: "/teacher/homework", label: tr("Uy vazifasi", "Домашка"), icon: BookOpen, section: TEACHING, primary: true },
    { to: "/teacher/grades", label: tr("Baholar", "Оценки"), icon: Award, section: TEACHING, primary: true },
    { to: "/teacher/quizzes", label: tr("Testlar", "Тесты"), icon: ClipboardCheck, section: TEACHING },

    { to: "/teacher/coins", label: tr("Coinlar", "Монеты"), icon: Coins, section: tr("GAMIFIKATSIYA", "ГЕЙМИФИКАЦИЯ") },
    { to: "/teacher/finance", label: tr("Mening daromadim", "Мой доход"), icon: Wallet, section: tr("MOLIYA", "ФИНАНСЫ") },
    { to: "/teacher/messages", label: tr("Xabarlar", "Сообщения"), icon: MessageSquare, section: tr("ALOQA", "СВЯЗЬ") },
  ];

  return (
    <RoleGuard allow="teacher">
      {/* comfortable: учитель читает экран между занятиями, часто с телефона
          и на ходу — плотность админской таблицы здесь во вред. */}
      <AppShell items={items} density="comfortable">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
