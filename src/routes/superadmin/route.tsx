import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Building2, FileClock, BarChart3, Settings, type LucideIcon } from "lucide-react";
import { EnterpriseLayout, type RailItem, type SidebarItem } from "@/components/layouts/enterprise-layout";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/superadmin")({
  component: SuperadminLayout,
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

function SuperadminLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const section = tr("PLATFORMA", "ПЛАТФОРМА");

  const groups: RailGroup[] = [
    {
      rail: { id: "institutions", icon: Building2, label: tr("Tashkilotlar", "Организации") },
      sidebar: [{ id: "institutions", to: "/superadmin", icon: Building2, label: tr("Tashkilotlar", "Организации"), section }],
    },
    {
      rail: { id: "analytics", icon: BarChart3, label: tr("Analitika", "Аналитика") },
      sidebar: [{ id: "analytics", to: "/superadmin/analytics", icon: BarChart3, label: tr("Analitika", "Аналитика"), section }],
    },
    {
      rail: { id: "logs", icon: FileClock, label: tr("Loglar", "Логи") },
      sidebar: [{ id: "logs", to: "/superadmin/logs", icon: FileClock, label: tr("Loglar", "Логи"), section }],
    },
    {
      rail: { id: "settings", icon: Settings, label: tr("Sozlamalar", "Настройки") },
      sidebar: [{ id: "settings", to: "/superadmin/settings", icon: Settings, label: tr("Sozlamalar", "Настройки"), section }],
    },
  ];

  const path = location.pathname;
  let activeRailId = groups[0].rail.id;
  let activeSidebarId = groups[0].sidebar[0].id;
  let bestLen = -1;
  for (const g of groups) {
    for (const leaf of g.sidebar) {
      const matches = path === leaf.to || (leaf.to !== "/superadmin" && path.startsWith(`${leaf.to}/`));
      if ((matches || (leaf.to === "/superadmin" && path === "/superadmin")) && leaf.to.length > bestLen) {
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

  const breadcrumb = [{ label: tr("Platforma", "Платформа") }, { label: activeGroup.rail.label }];

  return (
    <RoleGuard allow="superadmin">
      <EnterpriseLayout
        railItems={groups.map((g) => g.rail)}
        activeRailId={activeRailId}
        onRailChange={handleRailChange}
        sidebarTitle={tr("Platforma", "Платформа")}
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
