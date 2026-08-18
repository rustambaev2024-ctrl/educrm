import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Award, BookOpen, ClipboardCheck, Layers, LayoutDashboard, MessageSquare } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/support-teacher")({
  component: SupportTeacherLayout,
});

function SupportTeacherLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const TEACHING = tr("TA'LIM", "ОБУЧЕНИЕ");

  /**
   * Тот же рабочий день, что у учителя: открыть день, отметить
   * посещаемость, проверить задания и оценки. «Группы» и «Сообщения» —
   * просмотр, уходят в «Ещё».
   */
  const items: NavItem[] = [
    { to: "/support-teacher", label: tr("Bugun", "Сегодня"), icon: LayoutDashboard, primary: true },

    { to: "/support-teacher/groups", label: tr("Guruhlar", "Группы"), icon: Layers, section: TEACHING },
    { to: "/support-teacher/attendance", label: tr("Davomat", "Посещаемость"), icon: ClipboardCheck, section: TEACHING, primary: true },
    { to: "/support-teacher/homework", label: tr("Vazifalar", "Задания"), icon: BookOpen, section: TEACHING, primary: true },
    { to: "/support-teacher/grades", label: tr("Baholar", "Оценки"), icon: Award, section: TEACHING, primary: true },

    { to: "/support-teacher/messages", label: tr("Xabarlar", "Сообщения"), icon: MessageSquare, section: tr("ALOQA", "СВЯЗЬ") },
  ];

  return (
    <RoleGuard allow="support_teacher">
      <AppShell items={items} density="comfortable">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
