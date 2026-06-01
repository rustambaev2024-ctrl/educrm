import { Link, useLocation } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "@/components/edu/notifications-popover";
import { LangToggle } from "@/components/edu/lang-toggle";
import { useI18n } from "@/lib/i18n";
import { branchApi } from "@/lib/api";

export interface MobileNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function MobileLayout({ items, children }: { items: MobileNavItem[]; children: ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [instName, setInstName] = useState("EduCRM");
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

  const initials = user?.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-[#0f172a]">
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[#e2e8f0] bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0077b6] text-sm font-bold text-white">
            {instLogo && !logoError ? (
              <img src={instLogo} alt="Logo" className="size-full object-contain" onError={() => setLogoError(true)} />
            ) : (
              instName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="truncate text-[13px] font-semibold">{instName}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LangToggle />
          <NotificationsPopover size="sm" />
          <Avatar className="size-8">
            <AvatarFallback className="bg-[#0077b6] text-[11px] font-semibold text-white">{initials}</AvatarFallback>
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

      {/* Content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#f1f5f9] bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {items.map((item) => {
            const active =
              location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to + "/"));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors ${
                  active ? "text-[#0077b6]" : "text-[#94a3b8] hover:text-[#64748b]"
                }`}
              >
                <div
                  className="flex size-9 items-center justify-center rounded-lg transition-colors"
                >
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
