import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { EnterpriseLayout, type RailItem, type SidebarItem } from "@/components/layouts/enterprise-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/teacher")({
  component: TeacherLayout,
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

function TeacherLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const groups: RailGroup[] = [
    {
      rail: { id: "dashboard", icon: LayoutDashboard, label: tr("Bugun", "Сегодня") },
      sidebar: [{ id: "dashboard", to: "/teacher", icon: LayoutDashboard, label: tr("Bugun", "Сегодня") }],
    },
    {
      rail: { id: "teaching", icon: Layers, label: tr("Ta'lim", "Обучение") },
      sidebar: [
        { id: "groups", to: "/teacher/groups", icon: Layers, label: tr("Mening guruhlarim", "Мои группы"), section: tr("TA'LIM", "ОБУЧЕНИЕ") },
        { id: "attendance", to: "/teacher/attendance", icon: ClipboardCheck, label: tr("Davomat", "Посещаемость"), section: tr("TA'LIM", "ОБУЧЕНИЕ") },
        { id: "homework", to: "/teacher/homework", icon: BookOpen, label: tr("Uy vazifasi", "Домашнее задание"), section: tr("TA'LIM", "ОБУЧЕНИЕ") },
        { id: "grades", to: "/teacher/grades", icon: Award, label: tr("Baholar", "Оценки"), section: tr("TA'LIM", "ОБУЧЕНИЕ") },
        { id: "quizzes", to: "/teacher/quizzes", icon: ClipboardCheck, label: tr("Testlar", "Тесты"), section: tr("TA'LIM", "ОБУЧЕНИЕ") },
      ],
    },
    {
      rail: { id: "finance", icon: Wallet, label: tr("Daromad", "Доход") },
      sidebar: [
        { id: "finance", to: "/teacher/finance", icon: Wallet, label: tr("Mening daromadim", "Мой доход"), section: tr("MOLIYA", "ФИНАНСЫ") },
      ],
    },
    {
      rail: { id: "messages", icon: MessageSquare, label: tr("Xabarlar", "Сообщения") },
      sidebar: [
        { id: "messages", to: "/teacher/messages", icon: MessageSquare, label: tr("Xabarlar", "Сообщения"), section: tr("ALOQA", "СВЯЗЬ") },
      ],
    },
  ];

  const path = location.pathname;
  let activeRailId = groups[0].rail.id;
  let activeSidebarId = groups[0].sidebar[0].id;
  let bestLen = -1;
  for (const g of groups) {
    for (const leaf of g.sidebar) {
      const matches = path === leaf.to || (leaf.to !== "/teacher" && path.startsWith(`${leaf.to}/`));
      if ((matches || (leaf.to === "/teacher" && path === "/teacher")) && leaf.to.length > bestLen) {
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
    <RoleGuard allow="teacher">
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
