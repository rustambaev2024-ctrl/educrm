import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Layers,
  Calendar,
  DollarSign,
  BarChart3,
  ShieldCheck,
  KeyRound,
  MessageSquarePlus,
  ClipboardList,
  ClipboardCheck,
  Bell,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { EnterpriseLayout, type RailItem, type SidebarItem } from "@/components/layouts/enterprise-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

interface NavLeaf {
  id: string;
  to: string;
  icon: LucideIcon;
  label: string;
  section?: string;
}

interface RailGroup {
  rail: RailItem;
  // первый путь — основной (куда ведёт клик по rail)
  sidebar: NavLeaf[];
}

function AdminLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const groups: RailGroup[] = [
    {
      rail: { id: "dashboard", icon: LayoutDashboard, label: tr("Boshqaruv", "Панель") },
      sidebar: [{ id: "dashboard", to: "/admin", icon: LayoutDashboard, label: tr("Bugun", "Сегодня") }],
    },
    {
      rail: { id: "students", icon: Users, label: tr("O'quvchilar", "Ученики") },
      sidebar: [
        { id: "students", to: "/admin/students", icon: Users, label: tr("Barcha o'quvchilar", "Все ученики"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
        { id: "leads", to: "/admin/leads", icon: MessageSquarePlus, label: tr("Murojaatlar", "Заявки"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
        { id: "accounts", to: "/admin/accounts", icon: KeyRound, label: tr("Akkauntlar", "Аккаунты"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
        { id: "quizzes", to: "/admin/quizzes", icon: ClipboardCheck, label: tr("Testlar", "Тесты"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
      ],
    },
    {
      rail: { id: "groups", icon: Layers, label: tr("Guruhlar", "Группы") },
      sidebar: [
        { id: "groups", to: "/admin/groups", icon: Layers, label: tr("Guruhlar", "Группы"), section: tr("GURUHLAR", "ГРУППЫ") },
        { id: "schedule", to: "/admin/schedule", icon: Calendar, label: tr("Dars jadvali", "Расписание"), section: tr("GURUHLAR", "ГРУППЫ") },
      ],
    },
    {
      rail: { id: "finance", icon: DollarSign, label: tr("Moliya", "Финансы") },
      sidebar: [
        { id: "finance", to: "/admin/finance", icon: DollarSign, label: tr("Umumiy", "Общее"), section: tr("MOLIYA", "ФИНАНСЫ") },
        { id: "daily-report", to: "/admin/daily-report", icon: ClipboardList, label: tr("Kunlik hisobot", "Дневной отчёт"), section: tr("HISOBOTLAR", "ОТЧЁТЫ") },
        { id: "analytics", to: "/admin/analytics", icon: BarChart3, label: tr("Analitika", "Аналитика"), section: tr("HISOBOTLAR", "ОТЧЁТЫ") },
      ],
    },
    {
      rail: { id: "control", icon: ShieldCheck, label: tr("Nazorat", "Контроль") },
      sidebar: [
        { id: "control", to: "/admin/control", icon: ShieldCheck, label: tr("Nazorat", "Контроль"), section: tr("NAZORAT", "КОНТРОЛЬ") },
        { id: "notifications", to: "/admin/notifications", icon: Bell, label: tr("Bildirishnomalar", "Уведомления"), section: tr("NAZORAT", "КОНТРОЛЬ") },
        { id: "messages", to: "/admin/messages", icon: MessageSquare, label: tr("Xabarlar", "Сообщения"), section: tr("NAZORAT", "КОНТРОЛЬ") },
      ],
    },
  ];

  // Определяем активный rail+sidebar по текущему пути.
  // Берём sidebar-пункт с самым длинным совпадающим to.
  const path = location.pathname;
  let activeRailId = groups[0].rail.id;
  let activeSidebarId = groups[0].sidebar[0].id;
  let bestLen = -1;
  for (const g of groups) {
    for (const leaf of g.sidebar) {
      const matches = path === leaf.to || (leaf.to !== "/admin" && path.startsWith(`${leaf.to}/`));
      if ((matches || (leaf.to === "/admin" && path === "/admin")) && leaf.to.length > bestLen) {
        bestLen = leaf.to.length;
        activeRailId = g.rail.id;
        activeSidebarId = leaf.id;
      }
    }
  }

  const activeGroup = groups.find((g) => g.rail.id === activeRailId) ?? groups[0];

  const sidebarItems: SidebarItem[] = activeGroup.sidebar.map((leaf) => ({
    id: leaf.id,
    icon: leaf.icon,
    label: leaf.label,
    section: leaf.section,
  }));

  const handleRailChange = (id: string) => {
    const g = groups.find((x) => x.rail.id === id);
    if (g) navigate({ to: g.sidebar[0].to });
  };

  const handleSidebarChange = (id: string) => {
    const leaf = activeGroup.sidebar.find((x) => x.id === id);
    if (leaf) navigate({ to: leaf.to });
  };

  const handleNavigate = (railId: string, sidebarId: string) => {
    const g = groups.find((x) => x.rail.id === railId);
    const leaf = g?.sidebar.find((x) => x.id === sidebarId);
    if (leaf) navigate({ to: leaf.to });
  };

  const railSidebars = Object.fromEntries(
    groups.map((g) => [
      g.rail.id,
      {
        title: g.rail.label,
        items: g.sidebar.map((leaf) => ({ id: leaf.id, icon: leaf.icon, label: leaf.label, section: leaf.section })),
      },
    ]),
  );

  const activeLeaf = activeGroup.sidebar.find((l) => l.id === activeSidebarId);
  const breadcrumb = [
    { label: activeGroup.rail.label },
    ...(activeLeaf && activeLeaf.label !== activeGroup.rail.label ? [{ label: activeLeaf.label }] : []),
  ];

  return (
    <RoleGuard allow="admin">
      <EnterpriseLayout
        railItems={groups.map((g) => g.rail)}
        activeRailId={activeRailId}
        onRailChange={handleRailChange}
        sidebarTitle={activeGroup.rail.label}
        sidebarItems={sidebarItems}
        activeSidebarId={activeSidebarId}
        onSidebarChange={handleSidebarChange}
        railSidebars={railSidebars}
        onNavigate={handleNavigate}
        breadcrumb={breadcrumb}
      >
        <Outlet />
      </EnterpriseLayout>
    </RoleGuard>
  );
}
