import { Bell, Wallet, Calendar, BookOpen, Settings, MessageCircle, ClipboardCheck, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/lib/data/store";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { NotificationKind } from "@/lib/data/types";

const KIND_META: Record<NotificationKind, { icon: typeof Bell; tone: string }> = {
  payment: { icon: Wallet, tone: "bg-success/15 text-success" },
  lesson: { icon: Calendar, tone: "bg-info/15 text-info" },
  homework: { icon: BookOpen, tone: "bg-accent text-primary" },
  system: { icon: Settings, tone: "bg-muted text-muted-foreground" },
  message: { icon: MessageCircle, tone: "bg-info/15 text-info" },
  attendance: { icon: ClipboardCheck, tone: "bg-warning/15 text-warning-foreground" },
  debtor: { icon: AlertTriangle, tone: "bg-destructive/15 text-destructive" },
};

function relativeTime(iso: string, lang: "uz" | "ru") {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 60) return lang === "uz" ? `${Math.max(1, Math.floor(diff))} daq.` : `${Math.max(1, Math.floor(diff))} мин`;
  if (diff < 60 * 24) return lang === "uz" ? `${Math.floor(diff / 60)} soat` : `${Math.floor(diff / 60)} ч`;
  return lang === "uz" ? `${Math.floor(diff / 60 / 24)} kun` : `${Math.floor(diff / 60 / 24)} дн`;
}

export function NotificationsPopover({ size = "md" }: { size?: "sm" | "md" }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useData();

  const audience = user?.role;
  const my = audience ? notifications.filter((n) => n.audience.includes(audience)) : [];
  const unread = my.filter((n) => !n.read).length;
  const sorted = [...my].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const iconClass = size === "sm" ? "size-4" : "size-4";
  const btnClass = size === "sm" ? "size-8" : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={`relative ${btnClass}`} aria-label={t("notif.title")}>
          <Bell className={iconClass} />
          {unread > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center bg-destructive p-0 px-1 text-[10px] text-destructive-foreground">
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t("notif.title")}</span>
            {unread > 0 && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{unread}</Badge>}
          </div>
          {unread > 0 && audience && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllNotificationsRead(audience)}
            >
              <Check className="mr-1 size-3" /> {lang === "uz" ? "Barchasi" : "Все"}
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {sorted.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("notif.empty")}</div>
          ) : (
            <div className="divide-y divide-border/60">
              {sorted.map((n) => {
                const meta = KIND_META[n.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 ${
                      n.read ? "" : "bg-accent/20"
                    }`}
                  >
                    <div className={`mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold">{n.title}</div>
                        <div className="flex-shrink-0 text-[10px] text-muted-foreground">{relativeTime(n.createdAt, lang)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{n.body}</div>
                    </div>
                    {!n.read && <div className="mt-1.5 size-2 flex-shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}