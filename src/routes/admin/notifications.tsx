import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notificationApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Users, BookOpen, AlertTriangle, Calendar, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({ component: NotificationsPage });

const typeConfig: Record<string, { icon: any; color: string; bg: string; label: string; labelRu: string }> = {
  lead_follow_up: { icon: Users, color: "text-amber-500", bg: "bg-amber-500/10", label: "Murojaat", labelRu: "Заявка" },
  debtor_alert: { icon: DollarSign, color: "text-destructive", bg: "bg-destructive/10", label: "Qarzdor", labelRu: "Должник" },
  lesson_reminder: { icon: Calendar, color: "text-[#0077b6]", bg: "bg-[#e0f2fe]", label: "Dars", labelRu: "Урок" },
  trial_lesson_reminder: { icon: Calendar, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Sinov darsi", labelRu: "Пробный урок" },
  homework_deadline: { icon: BookOpen, color: "text-violet-500", bg: "bg-violet-500/10", label: "Vazifa", labelRu: "Задание" },
  lesson_cancelled: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", label: "Bekor", labelRu: "Отмена" },
  payment_due: { icon: DollarSign, color: "text-amber-500", bg: "bg-amber-500/10", label: "To'lov", labelRu: "Платёж" },
  default: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted", label: "", labelRu: "" },
};

function NotificationsPage() {
  const { lang } = useI18n();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    notificationApi.list()
      .then((res: any) => setNotifications(Array.isArray(res) ? res : res.results ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) { console.error(err); }
  };

  const markRead = async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) { console.error(err); }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filtered = notifications.filter((n) => {
    if (filter === "unread" && n.is_read) return false;
    if (typeFilter !== "all" && n.notification_type !== typeFilter) return false;
    return true;
  });

  return (
    <PageShell
      title={lang === "uz" ? "Bildirishnomalar" : "Уведомления"}
      subtitle={lang === "uz" ? "Barcha xabar va ogohlantirishlar" : "Все уведомления и напоминания"}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border p-1 gap-1">
              <Button size="sm" variant={filter === "all" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("all")}>
                {lang === "uz" ? "Barchasi" : "Все"}
              </Button>
              <Button size="sm" variant={filter === "unread" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("unread")}>
                {lang === "uz" ? "O'qilmagan" : "Непрочитанные"}
                {unreadCount > 0 && <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">{unreadCount}</Badge>}
              </Button>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "uz" ? "Barcha turlar" : "Все типы"}</SelectItem>
                <SelectItem value="lead_follow_up">{lang === "uz" ? "Murojaatlar" : "Лиды"}</SelectItem>
                <SelectItem value="debtor_alert">{lang === "uz" ? "Qarzdorlar" : "Должники"}</SelectItem>
                <SelectItem value="lesson_reminder">{lang === "uz" ? "Darslar" : "Уроки"}</SelectItem>
                <SelectItem value="homework_deadline">{lang === "uz" ? "Vazifalar" : "Задания"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              {lang === "uz" ? "Barchasini o'qilgan" : "Прочитать все"}
            </Button>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{lang === "uz" ? "Bildirishnomalar yo'q" : "Уведомлений нет"}</p>
          </div>
        )}

        {!loading && (
          <div className="space-y-2">
            {filtered.map((n) => {
              const cfg = typeConfig[n.notification_type] ?? typeConfig.default;
              const Icon = cfg.icon;
              const cfgLabel = lang === "uz" ? cfg.label : (cfg.labelRu || cfg.label);
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors",
                    n.is_read ? "bg-background hover:bg-accent/30" : "bg-primary/5 border-primary/20 hover:bg-primary/10"
                  )}
                >
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", cfg.bg)}>
                    <Icon className={cn("h-4 w-4", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-medium", !n.is_read && "text-primary")}>{n.title}</p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(n.created_at, lang)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    {cfgLabel && <Badge variant="outline" className="mt-1.5 text-[10px] h-4 px-1.5">{cfgLabel}</Badge>}
                  </div>
                  {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
