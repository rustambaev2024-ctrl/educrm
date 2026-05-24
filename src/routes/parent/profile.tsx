import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Phone, Users, LogOut, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useData } from "@/lib/data/store";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useCurrentParentId } from "@/lib/data/identity";
import { LangToggle } from "@/components/edu/lang-toggle";

export const Route = createFileRoute("/parent/profile")({ component: ParentProfile });

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function ParentProfile() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const parentId = useCurrentParentId();
  const { parents, students, isLoading } = useData();

  const me = useMemo(() => parents.find((p) => p.id === parentId), [parents, parentId]);
  const children = useMemo(
    () => (me ? students.filter((s) => me.childrenIds.includes(s.id)) : []),
    [me, students],
  );

  const name = me?.fullName ?? user?.fullName ?? "—";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <Card className="overflow-hidden p-0 shadow-elegant">
        <div className="bg-gradient-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <Avatar className="size-16 ring-2 ring-white/20">
              <AvatarFallback className="bg-white/20 text-lg font-bold text-primary-foreground">{initialsOf(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{name}</h2>
              <div className="text-xs opacity-90">{me?.phone ?? "—"}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider opacity-80">{t("role.parent")}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 shadow-elegant">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.children")}</div>
        <div className="mt-3 space-y-2">
          {children.length === 0 && <div className="text-xs text-muted-foreground">{t("parent.noChildren")}</div>}
          {children.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <Avatar className="size-9"><AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">{initialsOf(c.fullName)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.fullName}</div>
                <div className="text-[11px] text-muted-foreground">{c.phone}</div>
              </div>
              <Users className="size-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 shadow-elegant">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.contacts")}</div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t("profile.phone")}</span>
            <span className="ml-auto font-medium">{me?.phone ?? "—"}</span>
          </div>
        </div>
      </Card>

      <Card className="p-4 shadow-elegant">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.settings")}</div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("profile.lang")}</span>
            <LangToggle />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("profile.theme")}</span>
            <Button variant="outline" size="sm" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => { logout(); navigate({ to: "/" }); }}>
        <LogOut className="mr-2 size-4" /> {t("profile.logout")}
      </Button>
    </div>
  );
}
