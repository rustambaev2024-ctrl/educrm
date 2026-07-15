import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { GraduationCap, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Topbar } from "@/components/edu/topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "@/components/edu/notifications-popover";
import { LangToggle } from "@/components/edu/lang-toggle";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { branchApi } from "@/lib/api";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
}

interface SidebarLayoutProps {
  items: NavItem[];
  children: ReactNode;
  brand?: string;
  showSearch?: boolean;
}

export function SidebarLayout({ items, children, brand = "EduCRM", showSearch = true }: SidebarLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const [instName, setInstName] = useState(brand);
  const [instLogo, setInstLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (!user || user.role === "superadmin") return;
    branchApi
      .institutionSettings()
      .then((data) => {
        if (data.name) setInstName(data.name);
        if (data.logo) {
          setInstLogo(data.logo);
          setLogoError(false);
        }
      })
      .catch((e) => console.error("Failed to load institution brand", e));
  }, [user]);

  const initials = user?.fullName
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const isActive = (to: string) =>
    location.pathname === to || (to !== "/" && to.split("/").length > 2 && location.pathname.startsWith(`${to}/`));

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <div className={`flex size-9 flex-shrink-0 items-center justify-center rounded-lg shadow-glow overflow-hidden ${instLogo && !logoError ? "bg-white p-0" : "bg-gradient-primary"}`}>
            {instLogo && !logoError ? (
              <img 
                src={instLogo} 
                alt="Logo" 
                className="w-full h-full object-contain" 
                onError={() => setLogoError(true)}
              />
            ) : (
              <GraduationCap className="size-5 text-primary-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-sidebar-foreground">{instName}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {user && t(`role.${user.role}`)}
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-elegant"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className={`size-4 ${active ? "" : "text-muted-foreground group-hover:text-sidebar-foreground"}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent text-accent-foreground"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-gradient-subtle p-3 text-xs">
            <div className="font-medium text-foreground">{instName} v1.0</div>
            <div className="mt-0.5 text-muted-foreground">{t("support.label")}: support@educrm.uz</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur-md md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex size-8 flex-shrink-0 items-center justify-center rounded-lg shadow-glow overflow-hidden ${instLogo ? "bg-white p-0.5" : "bg-gradient-primary"}`}>
              {instLogo ? (
                <img src={instLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <GraduationCap className="size-4 text-primary-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">{instName}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {user && t(`role.${user.role}`)}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <LangToggle />
            <NotificationsPopover size="sm" />
            <Avatar className="size-8">
              <AvatarFallback className="bg-gradient-primary text-[11px] font-semibold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("topbar.logout")}
              onClick={() => {
                logout();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="hidden md:block">
          <Topbar showSearch={showSearch} />
        </div>

        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
            {items.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex min-w-[76px] flex-shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div
                    className={`relative flex size-9 items-center justify-center rounded-lg transition-all ${
                      active ? "bg-accent shadow-sm" : ""
                    }`}
                  >
                    <item.icon className="size-[18px]" />
                    {item.badge !== undefined && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="max-w-[70px] truncate text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
