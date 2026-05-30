import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Moon, Search, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { useTheme } from "@/lib/theme";
import { branchApi } from "@/lib/api";

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

  breadcrumb: Crumb[];
  topTabs?: TopTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  actionButton?: { label: string; icon: LucideIcon; onClick: () => void };

  children: ReactNode;
}

export function EnterpriseLayout({
  railItems,
  activeRailId,
  onRailChange,
  sidebarTitle,
  sidebarItems,
  activeSidebarId,
  onSidebarChange,
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
  const { theme, toggle } = useTheme();

  const [instName, setInstName] = useState("EduCRM");
  const [instLogo, setInstLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const initials = user?.fullName
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  // Группировка sidebar items по секциям с сохранением порядка
  const sections: { name: string | null; items: SidebarItem[] }[] = [];
  for (const item of sidebarItems) {
    const sectionName = item.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.name === sectionName) {
      last.items.push(item);
    } else {
      sections.push({ name: sectionName, items: [item] });
    }
  }

  const RailButton = ({ item }: { item: RailItem }) => {
    const active = item.id === activeRailId;
    return (
      <button
        onClick={() => onRailChange(item.id)}
        title={item.label}
        aria-label={item.label}
        className={`relative flex size-10 items-center justify-center rounded-md transition-colors ${
          active
            ? "bg-blue-600 text-white"
            : "text-white/55 hover:bg-white/10 hover:text-white"
        }`}
      >
        <item.icon className="size-5" />
        {item.badge !== undefined && item.badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </button>
    );
  };

  const railContent = (
    <>
      <div className="flex flex-col items-center gap-2 px-2 pt-3">
        <div className="mb-1 flex size-9 items-center justify-center overflow-hidden rounded-lg bg-blue-600 text-base font-bold text-white">
          {instLogo && !logoError ? (
            <img
              src={instLogo}
              alt="Logo"
              className="size-full object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            instName.charAt(0).toUpperCase()
          )}
        </div>
        {railItems.map((item) => (
          <RailButton key={item.id} item={item} />
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center gap-1 px-2 pb-3">
        <div className="[&_button]:size-10 [&_button]:text-white/55 [&_button]:hover:bg-white/10 [&_button]:hover:text-white">
          <NotificationsPopover />
        </div>
        <button
          onClick={toggle}
          aria-label={t("theme.toggle")}
          className="flex size-10 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-10 items-center justify-center rounded-md transition-colors hover:bg-white/10">
              <Avatar className="size-7">
                <AvatarFallback className="bg-blue-600 text-[10px] font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{user?.phone}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                logout();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="mr-2 size-4" /> {t("topbar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  const sidebarContent = (
    <>
      <div className="border-b border-border px-4 py-3">
        <div className="text-[13px] font-semibold text-foreground">{sidebarTitle}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{instName}</div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-0.5">
            {section.name && (
              <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.name}
              </div>
            )}
            {section.items.map((item) => {
              const active = item.id === activeSidebarId;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSidebarChange(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                      : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Icon Rail — крайний левый, тёмный */}
      <aside className="hidden w-14 shrink-0 flex-col bg-slate-900 md:flex">{railContent}</aside>

      {/* Контекстный Sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        {sidebarContent}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-md md:px-4">
          {/* Mobile: открыть навигацию */}
          <button
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Menu"
          >
            <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Breadcrumb */}
          <nav className="flex min-w-0 items-center gap-1 text-[13px]">
            {breadcrumb.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                {crumb.href ? (
                  <Link to={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`truncate ${
                      idx === breadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>

          {/* Top Tabs */}
          {topTabs && topTabs.length > 0 && (
            <div className="hidden items-center gap-0.5 rounded-lg bg-muted/60 p-0.5 sm:flex">
              {topTabs.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                    className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
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
              className="hidden h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-[12px] text-muted-foreground transition-colors hover:bg-accent md:flex"
            >
              <Search className="size-3.5" />
              <span>{lang === "uz" ? "Qidirish" : "Поиск"}</span>
              <kbd className="rounded border bg-muted px-1 text-[10px] font-medium">⌘K</kbd>
            </button>
            <LangToggle />
            {actionButton && (
              <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={actionButton.onClick}>
                <actionButton.icon className="size-3.5" />
                <span className="hidden sm:inline">{actionButton.label}</span>
              </Button>
            )}
            {/* Mobile: уведомления + аватар */}
            <div className="md:hidden">
              <NotificationsPopover size="sm" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile drawer: rail + sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full">
            <div className="flex w-14 shrink-0 flex-col bg-slate-900">{railContent}</div>
            <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-sidebar">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
