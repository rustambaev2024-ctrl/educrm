import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, MoreHorizontal, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { activeIndex, groupBySection, splitTabs, type NavItem } from "./nav-model";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/edu/global-search";
import { LangToggle } from "@/components/edu/lang-toggle";
import { NotificationsPopover } from "@/components/edu/notifications-popover";
import { useInstitutionBrand } from "@/hooks/use-institution-brand";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export type { NavItem } from "./nav-model";

export interface AppShellProps {
  items: NavItem[];
  /**
   * comfortable — экран читают (учитель, помощник, ученик, родитель).
   * compact — экран обрабатывают: 1000+ строк, финансовые таблицы
   * (админ, директор, суперадмин).
   */
  density?: "comfortable" | "compact";
  children: ReactNode;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

/** Детерминированный по имени ряд палитры — .ava-0 … .ava-4 в styles.css. */
function avatarClass(name: string): string {
  return `ava-${(name.trim().charCodeAt(0) || 0) % 5}`;
}

/**
 * Единый каркас приложения для всех семи ролей.
 *
 * Заменил три: EnterpriseLayout (десктопный, доставался учителю, админу,
 * директору, помощнику и суперадмину — в том числе на телефоне),
 * MobileLayout (только ученик и родитель) и SidebarLayout (не использовал
 * никто). До этого пять ролей из семи получали на телефоне интерфейс,
 * спроектированный под мышь и монитор, — при том что с телефона работают все.
 *
 * Раскладку выбирает CSS, а не JavaScript: обе версии есть в разметке,
 * лишняя скрыта классом. Поэтому нет ни расхождения при гидратации,
 * ни прыжка вёрстки до загрузки скриптов.
 */
export function AppShell({ items, density = "comfortable", children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { lang } = useI18n();
  const brand = useInstitutionBrand();

  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  // Ctrl/Cmd+K — подсказка про это стоит прямо в кнопке поиска, поэтому
  // обработчик обязан существовать: подпись, которая врёт, хуже её отсутствия.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = activeIndex(items, location.pathname);
  const groups = groupBySection(items);

  const { tabs, rest: restItems } = splitTabs(items);
  const needsMore = restItems.length > 0;

  const name = user?.fullName ?? "";
  const initials = initialsOf(name);

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  const brandMark = (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
      {brand.logo ? (
        <img
          src={brand.logo}
          alt=""
          className="size-full object-contain"
          onError={brand.onLogoError}
        />
      ) : (
        brand.name.charAt(0).toUpperCase()
      )}
    </div>
  );

  return (
    <div data-density={density} className="min-h-dvh bg-background text-foreground">
      {/* ══ Боковое меню — широкий экран ══ */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
          {brandMark}
          <span className="truncate text-sm font-semibold">{brand.name}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group, groupIndex) => (
            <div key={group.section ?? `group-${groupIndex}`} className="mb-5 last:mb-0">
              {group.section && (
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                  {group.section}
                </div>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = items[active] === item;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        data-active={isActive ? "true" : undefined}
                        className="edu-nav-item relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground"
                      >
                        {/* Столп 6: тонкая цветная черта слева у активного пункта. */}
                        {isActive && (
                          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" />
                        )}
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary-foreground">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="truncate text-xs text-sidebar-foreground/55">
                {user?.role ? tr(user.role, user.role) : ""}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label={tr("Chiqish", "Выйти")}
              className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ══ Шапка — узкий экран ══ */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {brand.logo ? (
              <img
                src={brand.logo}
                alt=""
                className="size-full object-contain"
                onError={brand.onLogoError}
              />
            ) : (
              brand.name.charAt(0).toUpperCase()
            )}
          </div>
          <span className="truncate text-[13px] font-semibold">{brand.name}</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setSearchOpen(true)}
            aria-label={tr("Qidirish", "Поиск")}
          >
            <Search className="size-4" />
          </Button>
          <LangToggle />
          <NotificationsPopover size="sm" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex size-8 items-center justify-center rounded-full text-[11px] font-semibold ${avatarClass(name)}`}
                aria-label={tr("Hisob", "Аккаунт")}
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 size-4" />
                {tr("Chiqish", "Выйти")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ══ Шапка — широкий экран ══ */}
      <header className="sticky top-0 z-30 hidden h-14 items-center gap-2 border-b border-border bg-card px-6 lg:ml-64 lg:flex">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearchOpen(true)}
          className="gap-2 text-muted-foreground"
        >
          <Search className="size-4" />
          {tr("Qidirish", "Поиск")}
          <kbd className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <LangToggle />
          <NotificationsPopover />
        </div>
      </header>

      {/* ══ Контент ══
          pb под нижнюю панель — только на узком экране, где панель есть. */}
      <main className="pb-24 lg:ml-64 lg:pb-0">{children}</main>

      {/* ══ Нижние вкладки — узкий экран ══ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((item) => {
            const isActive = items[active] === item;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-active={isActive ? "true" : undefined}
                className="edu-tap flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground data-[active=true]:text-primary"
              >
                <item.icon className="size-[18px] shrink-0" />
                <span className="max-w-full truncate px-1 text-[10px] font-medium">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {needsMore && (
            <button
              onClick={() => setMoreOpen(true)}
              data-active={active >= 0 && restItems.includes(items[active]) ? "true" : undefined}
              className="edu-tap flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground data-[active=true]:text-primary"
              aria-label={tr("Yana", "Ещё")}
            >
              <MoreHorizontal className="size-[18px] shrink-0" />
              <span className="text-[10px] font-medium">{tr("Yana", "Ещё")}</span>
            </button>
          )}
        </div>
      </nav>

      {/* ══ «Ещё» — остальные разделы ══ */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetTitle className="px-4 pt-4 text-base">{tr("Barcha bo'limlar", "Все разделы")}</SheetTitle>
          <div className="grid grid-cols-1 gap-1 p-4 pt-2 sm:grid-cols-2">
            {restItems.map((item) => {
              const isActive = items[active] === item;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  data-active={isActive ? "true" : undefined}
                  className="edu-row flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm data-[active=true]:bg-accent data-[active=true]:font-semibold data-[active=true]:text-accent-foreground"
                >
                  <item.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
