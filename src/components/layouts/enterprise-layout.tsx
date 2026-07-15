import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Menu, Search, Settings, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/* ── Public types — kept identical so route files need no changes ── */
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

/* ── helpers ── */
const ava = (name: string) => (name.trim().charCodeAt(0) || 0) % 5;

export function EnterpriseLayout({
  railItems,
  activeRailId,
  onRailChange,
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
  const location = useLocation();
  const { user, logout } = useAuth();
  const { lang } = useI18n();

  const [instName, setInstName] = useState("EduCRM");
  const [instLogo, setInstLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role === "superadmin") return;
    branchApi
      .institutionSettings()
      .then((d) => {
        if (d.name) setInstName(d.name);
        if (d.logo) { setInstLogo(d.logo); setLogoError(false); }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const userInitials = (user?.fullName ?? "?")
    .split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  /* group sidebar items by section */
  const groupBySection = (items: SidebarItem[]) => {
    const sections: { name: string | null; items: SidebarItem[] }[] = [];
    for (const item of items) {
      const n = item.section ?? null;
      const last = sections[sections.length - 1];
      if (last && last.name === n) last.items.push(item);
      else sections.push({ name: n, items: [item] });
    }
    return sections;
  };

  /* ── Sidebar content ── */
  const renderSidebar = (onItemClick?: () => void) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a2332",
        width: 240,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 8,
            background: "#0077b6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 16,
            color: "#fff",
            overflow: "hidden",
          }}
        >
          {instLogo && !logoError ? (
            <img src={instLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setLogoError(true)} />
          ) : (
            instName.charAt(0).toUpperCase()
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {instName}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>EduCRM</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {railItems.map((rail) => {
          const data = railSidebars?.[rail.id];
          const items = data?.items ?? (rail.id === activeRailId ? sidebarItems : []);
          if (items.length === 0) return null;
          return (
            <div key={rail.id}>
              {groupBySection(items).map((section, idx) => (
                <div key={idx}>
                  {section.name && (
                    <div
                      style={{
                        padding: "14px 14px 4px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.3)",
                      }}
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
                          if (onNavigate) onNavigate(rail.id, item.id);
                          else if (rail.id === activeRailId) onSidebarChange(item.id);
                          else onRailChange(rail.id);
                          onItemClick?.();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          margin: "1px 8px",
                          padding: "8px 12px",
                          borderRadius: 7,
                          width: "calc(100% - 16px)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          transition: "background 0.12s, color 0.12s",
                          background: active ? "#0077b6" : "transparent",
                          color: active ? "#fff" : "rgba(255,255,255,0.55)",
                          fontWeight: active ? 600 : 400,
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => {
                          if (!active) {
                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
                            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
                          }
                        }}
                      >
                        <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.label}
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            style={{
                              marginLeft: "auto",
                              background: item.badge > 5 ? "#9ef01a" : "rgba(255,255,255,0.12)",
                              color: item.badge > 5 ? "#1a4000" : "rgba(255,255,255,0.7)",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 7px",
                              borderRadius: 10,
                            }}
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
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: 12 }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#0077b6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {userInitials}
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.fullName}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                  {user?.phone}
                </div>
              </div>
              <Settings style={{ width: 14, height: 14, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
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
              <LogOut className="mr-2 h-4 w-4" />
              {lang === "uz" ? "Chiqish" : "Выйти"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="grid h-screen w-full overflow-hidden grid-cols-1 grid-rows-[52px_1fr] md:grid-cols-[240px_1fr]">
      {/* Sidebar — spans both rows on desktop */}
      <aside
        style={{ gridRow: "1 / 3", gridColumn: "1 / 2" }}
        className="hidden md:block"
      >
        {renderSidebar()}
      </aside>

      {/* Topbar */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 20px",
        }}
        className="flex items-center gap-3 col-start-1 md:col-start-2 row-start-1"
      >
        {/* Mobile burger */}
        <button
          className="md:hidden"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            background: "transparent",
            cursor: "pointer",
            color: "#64748b",
          }}
          onClick={() => setMobileOpen(true)}
        >
          <Menu style={{ width: 18, height: 18 }} />
        </button>

        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          {breadcrumb.map((crumb, idx) => (
            <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {idx > 0 && <ChevronRight style={{ width: 12, height: 12, color: "#cbd5e1", flexShrink: 0 }} />}
              {crumb.href ? (
                <Link to={crumb.href} style={{ color: "#94a3b8", textDecoration: "none" }}>
                  {crumb.label}
                </Link>
              ) : (
                <span style={{ color: idx === breadcrumb.length - 1 ? "#0f172a" : "#94a3b8", fontWeight: idx === breadcrumb.length - 1 ? 600 : 400 }}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Top Tabs */}
        {topTabs && topTabs.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              borderRadius: 8,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            {topTabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    background: active ? "#0077b6" : "transparent",
                    color: active ? "#fff" : "#64748b",
                    transition: "background 0.12s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Right cluster */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex"
            style={{
              height: 32,
              alignItems: "center",
              gap: 7,
              padding: "0 11px",
              borderRadius: 7,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              cursor: "pointer",
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <Search style={{ width: 13, height: 13, color: "#cbd5e1" }} />
            <span>{lang === "uz" ? "Qidirish" : "Поиск"}</span>
            <kbd
              style={{
                background: "#e2e8f0",
                color: "#64748b",
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              Ctrl K
            </kbd>
          </button>

          <LangToggle />
          <div style={{ color: "#64748b" }}>
            <NotificationsPopover />
          </div>
          {actionButton && (
            <button
              onClick={actionButton.onClick}
              className="btn-primary"
            >
              <actionButton.icon style={{ width: 14, height: 14 }} />
              <span className="hidden sm:inline">{actionButton.label}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main
        style={{
          background: "#f8fafc",
          overflowY: "auto",
          overflowX: "hidden",
        }}
        className="col-start-1 md:col-start-2 row-start-2"
      >
        <div key={location.pathname}>{children}</div>
      </main>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[240px] p-0 border-r-0 [&>button]:text-white">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {renderSidebar(() => setMobileOpen(false))}
        </SheetContent>
      </Sheet>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
