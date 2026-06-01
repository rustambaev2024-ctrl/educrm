import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Menu, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsPopover } from "@/components/edu/notifications-popover";
import { LangToggle } from "@/components/edu/lang-toggle";
import { GlobalSearch } from "@/components/edu/global-search";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { branchApi } from "@/lib/api";

/* ── Public types (unchanged — route files depend on these) ── */
export interface RailItem {
  id: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

export interface SidebarItem {
  id: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  section?: string;
}

export interface RailSidebar {
  title: string;
  items: SidebarItem[];
}

export interface Crumb {
  label: string;
  href?: string;
}

export interface TopTab {
  id: string;
  label: string;
}

export interface EnterpriseLayoutProps {
  railItems: RailItem[];
  activeRailId: string;
  onRailChange: (id: string) => void;

  sidebarTitle: string;
  sidebarItems: SidebarItem[];
  activeSidebarId: string;
  onSidebarChange: (id: string) => void;

  railSidebars?: Record<string, RailSidebar>;
  onNavigate?: (railId: string, sidebarId: string) => void;

  breadcrumb: Crumb[];
  topTabs?: TopTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  actionButton?: { label: string; icon: LucideIcon; onClick: () => void };

  children: ReactNode;
}

/* ── Avatar color helper ── */
const getAvatarStyle = (name: string) => {
  const colors = [
    { bg: "#caf0f8", text: "#0077b6" },
    { bg: "#dcfce7", text: "#166534" },
    { bg: "#fee2e2", text: "#dc2626" },
    { bg: "#fef3c7", text: "#d97706" },
    { bg: "#f3e8ff", text: "#7c3aed" },
  ];
  return colors[(name.charCodeAt(0) || 0) % colors.length];
};

export function EnterpriseLayout({
  railItems,
  activeRailId,
  onRailChange,
  sidebarTitle,
  sidebarItems,
  activeSidebarId,
  onSidebarChange,
  railSidebars,
  onNavigate,
  breadcrumb,
  topTabs,
  activeTabId,
  onTabChange,
  actionButton,
  children,
}: EnterpriseLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, lang } = useI18n();

  const [instName, setInstName] = useState("EduCRM");
  const [instLogo, setInstLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role === "superadmin") return;
    branchApi
      .institutionSettings()
      .then((data) => {
        if (data.name) setInstName(data.name);
        if (data.logo) { setInstLogo(data.logo); setLogoError(false); }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const userInitials = (user?.fullName ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const avatarStyle = getAvatarStyle(user?.fullName ?? "A");

  /* Group sidebar items by section */
  const groupBySection = (items: SidebarItem[]) => {
    const sections: { name: string | null; items: SidebarItem[] }[] = [];
    for (const item of items) {
      const sectionName = item.section ?? null;
      const last = sections[sections.length - 1];
      if (last && last.name === sectionName) last.items.push(item);
      else sections.push({ name: sectionName, items: [item] });
    }
    return sections;
  };

  /* Build all nav items flat for the sidebar */
  const allNavItems: { railId: string; item: SidebarItem }[] = [];
  for (const rail of railItems) {
    const data = railSidebars?.[rail.id];
    const items = data?.items ?? (rail.id === activeRailId ? sidebarItems : []);
    for (const item of items) {
      allNavItems.push({ railId: rail.id, item });
    }
  }

  /* ── Sidebar content ── */
  const renderSidebar = (onItemClick?: () => void) => (
    <div className="flex h-full flex-col" style={{ background: "#0077b6" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg font-bold text-sm"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          {instLogo && !logoError ? (
            <img src={instLogo} alt="Logo" className="h-full w-full object-contain" onError={() => setLogoError(true)} />
          ) : (
            instName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-white leading-tight">{instName}</div>
          <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>EduCRM</div>
        </div>
      </div>

      {/* Nav sections (from railSidebars or active sidebarItems) */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {railItems.map((rail) => {
          const data = railSidebars?.[rail.id];
          const items = data?.items ?? (rail.id === activeRailId ? sidebarItems : []);
          if (items.length === 0) return null;
          const sections = groupBySection(items);
          return (
            <div key={rail.id}>
              {sections.map((section, idx) => (
                <div key={idx} className="space-y-0.5">
                  {section.name && (
                    <div
                      className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      {section.name}
                    </div>
                  )}
                  {section.items.map((item) => {
                    const active = rail.id === activeRailId && item.id === activeSidebarId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate(rail.id, item.id);
                          } else if (rail.id === activeRailId) {
                            onSidebarChange(item.id);
                          } else {
                            onRailChange(rail.id);
                          }
                          onItemClick?.();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
                        style={
                          active
                            ? { background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 600 }
                            : { color: "rgba(255,255,255,0.75)" }
                        }
                        onMouseEnter={(e) => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                            style={{ background: "#9ef01a", color: "#006400" }}
                          >
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </nav>

      {/* User card */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }} className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
              style={{ color: "rgba(255,255,255,0.85)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[12px] font-medium text-white">{user?.fullName}</div>
                <div className="truncate text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>{user?.phone}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{user?.phone}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => { logout(); navigate({ to: "/" }); }}
            >
              <LogOut className="mr-2 h-4 w-4" /> {t("topbar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f9ff" }}>
      {/* Desktop sidebar */}
      <aside className="hidden w-[240px] shrink-0 md:flex flex-col" style={{ boxShadow: "2px 0 8px rgba(0,119,182,0.10)" }}>
        {renderSidebar()}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="flex h-12 shrink-0 items-center gap-3 px-4"
          style={{ background: "#fff", borderBottom: "2px solid #e0f2fe" }}
        >
          {/* Mobile burger */}
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md md:hidden"
            style={{ color: "#0077b6" }}
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <nav className="flex min-w-0 items-center gap-1 text-[13px]">
            {breadcrumb.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "#90e0ef" }} />}
                {crumb.href ? (
                  <Link to={crumb.href} className="truncate" style={{ color: "#00b4d8" }}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="truncate font-semibold"
                    style={{ color: idx === breadcrumb.length - 1 ? "#0077b6" : "#00b4d8" }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>

          {/* Top Tabs */}
          {topTabs && topTabs.length > 0 && (
            <div
              className="hidden items-center gap-0.5 rounded-lg p-0.5 sm:flex"
              style={{ background: "#f0f9ff", border: "1.5px solid #e0f2fe" }}
            >
              {topTabs.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                    className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors"
                    style={
                      active
                        ? { background: "#0077b6", color: "#fff" }
                        : { color: "#00b4d8" }
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-md px-3 text-[12px] transition-colors md:flex"
              style={{ background: "#f0f9ff", border: "1.5px solid #90e0ef", color: "#00b4d8" }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>{lang === "uz" ? "Qidirish" : "Поиск"}</span>
              <kbd
                className="rounded px-1 text-[10px] font-medium"
                style={{ background: "#e0f2fe", color: "#0077b6" }}
              >
                ⌘K
              </kbd>
            </button>
            <LangToggle />
            <div className="[&_button]:text-[#0077b6]">
              <NotificationsPopover />
            </div>
            {actionButton && (
              <button
                onClick={actionButton.onClick}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white transition-colors"
                style={{ background: "#0077b6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#00b4d8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0077b6"; }}
              >
                <actionButton.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{actionButton.label}</span>
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-[240px] shrink-0 flex-col" style={{ zIndex: 51 }}>
            <button
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full z-10"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar(() => setMobileOpen(false))}
          </div>
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
