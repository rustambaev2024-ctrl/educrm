import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { notificationApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Users, BookOpen, AlertTriangle, Calendar, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({ component: NotificationsPage });

const typeConfig: Record<string, { icon: any; color: string; bg: string; label: string; labelRu: string }> = {
  lead_follow_up: { icon: Users, color: "text-warn", bg: "bg-warn-soft", label: "Murojaat", labelRu: "Заявка" },
  debtor_alert: { icon: DollarSign, color: "text-destructive", bg: "bg-destructive/10", label: "Qarzdor", labelRu: "Должник" },
  lesson_reminder: { icon: Calendar, color: "text-[var(--primary)]", bg: "bg-[var(--info-soft)]", label: "Dars", labelRu: "Урок" },
  trial_lesson_reminder: { icon: Calendar, color: "text-ok", bg: "bg-ok-soft", label: "Sinov darsi", labelRu: "Пробный урок" },
  homework_deadline: { icon: BookOpen, color: "text-chart-5", bg: "bg-chart-5/10", label: "Vazifa", labelRu: "Задание" },
  lesson_cancelled: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", label: "Bekor", labelRu: "Отмена" },
  payment_due: { icon: DollarSign, color: "text-warn", bg: "bg-warn-soft", label: "To'lov", labelRu: "Платёж" },
  default: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted", label: "", labelRu: "" },
};

function NotificationsPage() {
  const { lang } = useI18n();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadData = () => {
    setLoading(true);
    notificationApi.list()
      .then((res: any) => {
        setNotifications(Array.isArray(res) ? res : res.results ?? []);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err));
    }
  };

  const markRead = async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err));
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filtered = notifications.filter((n) => {
    if (filter === "unread" && n.is_read) return false;
    if (typeFilter !== "all" && n.notification_type !== typeFilter) return false;
    return true;
  });

  const pageTitle = lang === "uz" ? "Bildirishnomalar" : "Уведомления";
  const pageSubtitle = lang === "uz" ? "Barcha xabar va ogohlantirishlar" : "Все уведомления и напоминания";

  if (loading) {
    return (
      <PageShell title={pageTitle} subtitle={pageSubtitle} ignoreLoadError>
        <ListSkeleton rows={5} />
      </PageShell>
    );
  }

  if (loadFailed) {
    return (
      <PageShell title={pageTitle} subtitle={pageSubtitle} ignoreLoadError>
        <ErrorState
          title={lang === "uz" ? "Ma'lumotlar yuklanmadi" : "Данные не загрузились"}
          description={
            lang === "uz"
              ? "Sahifa bo'sh ko'rinishi mumkin, lekin bu ma'lumot yo'qligini bildirmaydi. Aloqani tekshirib, qayta urinib ko'ring."
              : "Страница может выглядеть пустой, но это не значит, что данных нет. Проверьте связь и повторите."
          }
          onRetry={loadData}
          retryLabel={lang === "uz" ? "Qayta urinish" : "Повторить"}
        />
      </PageShell>
    );
  }

  return (
    <PageShell title={pageTitle} subtitle={pageSubtitle} ignoreLoadError>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border p-1 gap-1">
              <Button size="sm" variant={filter === "all" ? "default" : "ghost"} className="edu-tap h-7 text-xs" onClick={() => setFilter("all")}>
                {lang === "uz" ? "Barchasi" : "Все"}
              </Button>
              <Button size="sm" variant={filter === "unread" ? "default" : "ghost"} className="edu-tap h-7 text-xs" onClick={() => setFilter("unread")}>
                {lang === "uz" ? "O'qilmagan" : "Непрочитанные"}
                {unreadCount > 0 && <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">{unreadCount}</Badge>}
              </Button>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="edu-tap h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
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
            <Button variant="outline" size="sm" className="edu-tap" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              {lang === "uz" ? "Barchasini o'qilgan" : "Прочитать все"}
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-6" />}
            title={lang === "uz" ? "Bildirishnomalar yo'q" : "Уведомлений нет"}
          />
        ) : (
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
