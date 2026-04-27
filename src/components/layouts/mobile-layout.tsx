import { Link, useLocation } from "@tanstack/react-router";
import { GraduationCap, LogOut, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "@/components/edu/notifications-popover";
import { LangToggle } from "@/components/edu/lang-toggle";
import { useI18n } from "@/lib/i18n";

export interface MobileNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function MobileLayout({ items, children }: { items: MobileNavItem[]; children: ReactNode }) {
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const initials = user?.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Mobile topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-primary">
            <GraduationCap className="size-4 text-primary-foreground" />
          </div>
          <div className="text-sm font-bold">EduCRM</div>
        </div>
        <Avatar className="ml-auto size-8">
          <AvatarFallback className="bg-gradient-primary text-[11px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
        </Avatar>
        <LangToggle />
        <NotificationsPopover size="sm" />
        <Button variant="ghost" size="icon" className="size-8" onClick={toggle} aria-label={t("theme.toggle")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
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
      </header>

      {/* Content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {items.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to + "/"));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`flex size-9 items-center justify-center rounded-lg transition-all ${
                  active ? "bg-accent" : ""
                }`}>
                  <item.icon className="size-[18px]" />
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
