import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Search, Plus, Pencil, Trash2, Archive, LogIn, Wallet, X, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { AuditAction } from "@/lib/data/types";

export const Route = createFileRoute("/director/audit")({ component: AuditPage });

const ICONS: Record<AuditAction, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  archive: Archive,
  login: LogIn,
  payment: Wallet,
  cancel: X,
  reschedule: RefreshCw,
};

const TONES: Record<AuditAction, string> = {
  create: "bg-success/10 text-success",
  update: "bg-info/10 text-info",
  delete: "bg-destructive/10 text-destructive",
  archive: "bg-muted text-muted-foreground",
  login: "bg-accent text-primary",
  payment: "bg-success/10 text-success",
  cancel: "bg-destructive/10 text-destructive",
  reschedule: "bg-warning/15 text-warning",
};

function AuditPage() {
  const { t, lang } = useI18n();
  const { auditLog } = useData();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"all" | AuditAction>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLog
      .filter((a) => action === "all" || a.action === action)
      .filter((a) => !q || a.summary.toLowerCase().includes(q) || a.actorName.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [auditLog, action, search]);

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      <div className="space-y-4 p-4 md:p-8">
        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="pl-9" />
            </div>
            <Select value={action} onValueChange={(v) => setAction(v as typeof action)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {(Object.keys(ICONS) as AuditAction[]).map((a) => (
                  <SelectItem key={a} value={a}>{t(`audit.action.${a}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("audit.empty")}</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry) => {
                const Icon = ICONS[entry.action] ?? Activity;
                return (
                  <div key={entry.id} className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/30">
                    <div className={`flex size-9 flex-shrink-0 items-center justify-center rounded-lg ${TONES[entry.action]}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{entry.actorName}</span>
                        <Badge variant="outline" className="text-[10px]">{t(`role.${entry.actorRole}`)}</Badge>
                        <span className="text-xs text-muted-foreground">{t(`audit.action.${entry.action}`)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-foreground">{entry.summary}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(entry.createdAt, lang)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
