import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Layers,
  DollarSign,
  BarChart3,
  Settings,
  GraduationCap,
  MessageSquarePlus,
  MessageSquare,
  BadgeDollarSign,
  ShieldCheck,
  ClipboardList,
  FileClock,
  Building,
  BookOpen,
  Bell,
  Coins,
  type LucideIcon,
} from "lucide-react";
import { EnterpriseLayout, type RailItem, type SidebarItem } from "@/components/layouts/enterprise-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director")({
  component: DirectorLayout,
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
  sidebar: NavLeaf[];
}

function DirectorLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const groups: RailGroup[] = [
    {
      rail: { id: "dashboard", icon: LayoutDashboard, label: tr("Boshqaruv", "Управление") },
      sidebar: [{ id: "dashboard", to: "/director", icon: LayoutDashboard, label: tr("Boshqaruv paneli", "Панель управления") }],
    },
    {
      rail: { id: "students", icon: Users, label: tr("O'quvchilar", "Ученики") },
      sidebar: [
        { id: "students", to: "/director/students", icon: GraduationCap, label: tr("Barcha o'quvchilar", "Все ученики"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
        { id: "leads", to: "/director/leads", icon: MessageSquarePlus, label: tr("Murojaatlar", "Заявки"), section: tr("O'QUVCHILAR", "УЧЕНИКИ") },
      ],
    },
    {
      rail: { id: "staff", icon: Briefcase, label: tr("Xodimlar", "Сотрудники") },
      sidebar: [
        { id: "staff", to: "/director/staff", icon: Users, label: tr("Xodimlar", "Сотрудники"), section: tr("XODIMLAR", "СОТРУДНИКИ") },
        { id: "salaries", to: "/director/salaries", icon: BadgeDollarSign, label: tr("Ish haqi", "Зарплаты"), section: tr("XODIMLAR", "СОТРУДНИКИ") },
        { id: "penalties", to: "/director/penalties", icon: ShieldCheck, label: tr("Jarimalar va bonuslar", "Штрафы и бонусы"), section: tr("XODIMLAR", "СОТРУДНИКИ") },
      ],
    },
    {
      rail: { id: "groups", icon: Layers, label: tr("Guruhlar", "Группы") },
      sidebar: [
        { id: "courses", to: "/director/courses", icon: BookOpen, label: tr("Kurslar", "Курсы"), section: tr("GURUHLAR", "ГРУППЫ") },
      ],
    },
    {
      rail: { id: "finance", icon: DollarSign, label: tr("Moliya", "Финансы") },
      sidebar: [
        { id: "finance", to: "/director/finance", icon: DollarSign, label: tr("Moliya", "Финансы"), section: tr("MOLIYA", "ФИНАНСЫ") },
      ],
    },
    {
      rail: { id: "coins", icon: Coins, label: "Coins" },
      sidebar: [
        { id: "coins", to: "/director/coins", icon: Coins, label: "Coins", section: tr("GAMIFIKATSIYA", "ГЕЙМИФИКАЦИЯ") },
      ],
    },
    {
      rail: { id: "analytics", icon: BarChart3, label: tr("Hisobotlar", "Отчёты") },
      sidebar: [
        { id: "analytics", to: "/director/analytics", icon: BarChart3, label: tr("Analitika", "Аналитика"), section: tr("HISOBOTLAR", "ОТЧЁТЫ") },
        { id: "daily-report", to: "/director/daily-report", icon: ClipboardList, label: tr("Kunlik hisobot", "Дневной отчёт"), section: tr("HISOBOTLAR", "ОТЧЁТЫ") },
        { id: "audit", to: "/director/audit", icon: FileClock, label: tr("Audit", "Аудит"), section: tr("HISOBOTLAR", "ОТЧЁТЫ") },
      ],
    },
    {
      rail: { id: "settings", icon: Settings, label: tr("Sozlamalar", "Настройки") },
      sidebar: [
        { id: "branches", to: "/director/branches", icon: Building, label: tr("Filiallar", "Филиалы"), section: tr("SOZLAMALAR", "НАСТРОЙКИ") },
        { id: "integrations", to: "/director/integrations", icon: Settings, label: tr("Integratsiyalar", "Интеграции"), section: tr("SOZLAMALAR", "НАСТРОЙКИ") },
        { id: "settings", to: "/director/settings", icon: Building, label: tr("Sozlamalar", "Настройки"), section: tr("SOZLAMALAR", "НАСТРОЙКИ") },
        { id: "notifications", to: "/director/notifications", icon: Bell, label: tr("Bildirishnomalar", "Уведомления"), section: tr("SOZLAMALAR", "НАСТРОЙКИ") },
        { id: "messages", to: "/director/messages", icon: MessageSquare, label: tr("Xabarlar", "Сообщения"), section: tr("SOZLAMALAR", "НАСТРОЙКИ") },
      ],
    },
  ];

  const path = location.pathname;
  let activeRailId = groups[0].rail.id;
  let activeSidebarId = groups[0].sidebar[0].id;
  let bestLen = -1;
  for (const g of groups) {
    for (const leaf of g.sidebar) {
      const matches = path === leaf.to || (leaf.to !== "/director" && path.startsWith(`${leaf.to}/`));
      if ((matches || (leaf.to === "/director" && path === "/director")) && leaf.to.length > bestLen) {
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
    <RoleGuard allow="director">
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
