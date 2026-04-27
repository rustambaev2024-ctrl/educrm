import { Moon, Sun, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useI18n } from "@/lib/i18n";

export function Topbar({ title, showSearch = true }: { title?: string; showSearch?: boolean }) {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const initials = user?.fullName
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
      {title && <h1 className="hidden text-lg font-semibold md:block">{title}</h1>}
      {showSearch && (
        <div className="relative hidden max-w-sm flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={t("topbar.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-input bg-secondary/50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background"
          />
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <LangToggle />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme.toggle")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent">
              <Avatar className="size-8">
                <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium leading-tight">{user?.fullName}</div>
                <div className="text-[11px] leading-tight text-muted-foreground">
                  {user && t(`role.${user.role}`)}
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{user?.phone}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>{t("topbar.profile")}</DropdownMenuItem>
            <DropdownMenuItem>{t("topbar.settings")}</DropdownMenuItem>
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
    </header>
  );
}
