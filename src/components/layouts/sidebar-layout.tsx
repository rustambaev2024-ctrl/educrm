import { Link, useLocation } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Topbar } from "@/components/edu/topbar";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

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
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <GraduationCap className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-sidebar-foreground">{brand}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {user && t(`role.${user.role}`)}
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to + "/"));
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
                <span className="flex-1">{item.label}</span>
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
            <div className="font-medium text-foreground">EduCRM v1.0</div>
            <div className="mt-0.5 text-muted-foreground">{t("support.label")}: support@educrm.uz</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar showSearch={showSearch} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
