import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Users, UserCheck, AlertCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useData } from "@/lib/data/store";
import { formatMoney } from "@/lib/format";
import type { Student, StudentStatus } from "@/lib/data/types";
import { studentApi } from "@/lib/api";
import { mapStudents } from "@/lib/data/mappers";
import { cn } from "@/lib/utils";
import { CreateStudentSheet, StudentDetailSheet } from "@/components/students";

export { CreateStudentSheet } from "@/components/students";

export const Route = createFileRoute("/admin/students")({ component: StudentsPage });

type StatusFilter = "all" | StudentStatus;

const STATUS_OPTIONS: StatusFilter[] = [
  "all",
  "active",
  "debtor",
  "frozen",
  "graduate",
  "expelled",
  "archived",
];

const _avaBg  = ["#dbeafe","#dcfce7","#fce7f3","#fef3c7","#f3e8ff"];
const _avaTxt = ["#1d4ed8","#15803d","#9d174d","#92400e","#7c3aed"];
const getAvatarStyle = (name: string) => {
  const i = (name.trim().charCodeAt(0) || 0) % 5;
  return { bg: _avaBg[i], text: _avaTxt[i] };
};

const studentInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const studentStatusClass = (status: StudentStatus) => {
  const map: Record<StudentStatus, string> = {
    active: "badge-status-active",
    debtor: "badge-status-debt",
    frozen: "badge-status-frozen",
    graduate: "badge-status-trial",
    expelled: "badge-status-debt",
    archived: "badge-status-frozen",
  };
  return map[status] ?? "badge-status-trial";
};

export function StudentsPage() {
  const { t, lang } = useI18n();
  const { students, groups, addStudent, archiveStudent, deleteStudent, isLoading } = useData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageStudents, setPageStudents] = useState<Student[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const PAGE_SIZE = 50;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    const loadStudents = async () => {
      setPageLoading(true);
      try {
        const params: Record<string, string> = {
          page: String(page),
          page_size: String(PAGE_SIZE),
        };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (statusFilter !== "all") params.status = statusFilter;
        const res = await studentApi.list(params) as any;
        const list = Array.isArray(res) ? res : (res.results ?? []);
        const count = res.count ?? list.length;
        setPageStudents(mapStudents(list) as Student[]);
        setTotalCount(count);
      } catch (err) {
        console.warn("[students] load failed:", err);
      } finally {
        setPageLoading(false);
      }
    };
    loadStudents();
  }, [page, debouncedSearch, statusFilter]);

  const filtered = pageStudents;

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let active = 0;
    let debtor = 0;
    let fresh = 0;
    for (const s of students) {
      if (s.status === "active") active++;
      if (s.status === "debtor") debtor++;
      if (s.registeredAt && new Date(s.registeredAt) >= monthStart) fresh++;
    }
    return { total: students.length, active, debtor, fresh };
  }, [students]);

  const selected = useMemo(() => {
    return pageStudents.find((s) => s.id === selectedId)
      ?? students.find((s) => s.id === selectedId)
      ?? null;
  }, [students, pageStudents, selectedId]);

  if (isLoading && !pageStudents.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={t("students.title")}
      subtitle={t("students.subtitle")}
      actions={
        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary h-8 px-3 text-[12px]"
        >
          <Plus className="h-3.5 w-3.5" /> {t("students.add")}
        </button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("students.title")} value={kpis.total} icon={Users} iconColor="blue" />
        <KpiCard label={t("status.active")} value={kpis.active} icon={UserCheck} iconColor="green" />
        <KpiCard label={t("status.debtor")} value={kpis.debtor} icon={AlertCircle} iconColor="red" />
        <KpiCard label={lang === "uz" ? "Yangi (bu oy)" : "Новые (мес.)"} value={kpis.fresh} icon={UserPlus} iconColor="violet" />
      </div>
      <div>
        <div className="edu-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("students.search")}
                className="pl-9"
                autoComplete="off"
                name="student-search-field"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{totalCount} {t("students.count")}</span>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "all" ? t("common.all") : t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            debouncedSearch.trim() ? (
              <EmptyState
                icon={<Search className="size-7" />}
                title={lang === "uz" ? "Hech narsa topilmadi" : "Ничего не найдено"}
                description={lang === "uz" ? "Boshqa so'rov bilan urinib ko'ring" : "Попробуйте изменить запрос"}
              />
            ) : (
              <EmptyState
                icon={<Users className="size-7" />}
                title={t("students.empty")}
                description={lang === "uz" ? "Hozircha o'quvchilar qo'shilmagan" : "Пока нет добавленных учеников"}
                action={{ label: t("students.add"), onClick: () => setCreateOpen(true) }}
              />
            )
          ) : (
            <Table className="edu-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "uz" ? "O'quvchi" : "Ученик"}</TableHead>
                  <TableHead>{lang === "uz" ? "Guruhlar" : "Группы"}</TableHead>
                  <TableHead className="text-right">{lang === "uz" ? "Balans" : "Баланс"}</TableHead>
                  <TableHead>{lang === "uz" ? "Holat" : "Статус"}</TableHead>
                  <TableHead className="text-right">{lang === "uz" ? "Amallar" : "Действия"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const groupNames = s.groupIds
                    .map((gid) => groups.find((g) => g.id === gid)?.name)
                    .filter(Boolean)
                    .slice(0, 2);
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer transition-colors"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {(() => {
                            const av = getAvatarStyle(s.fullName);
                            return (
                              <div
                                style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, background: av.bg, color: av.text, flexShrink: 0, overflow: "hidden" }}
                              >
                                {s.photo ? (
                                  <img src={s.photo} alt={s.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  studentInitials(s.fullName)
                                )}
                              </div>
                            );
                          })()}
                          <div className="min-w-0">
                            <div style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.fullName}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{s.phone}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {groupNames.length === 0 ? (
                          <span className="text-muted-foreground">{t("students.noGroups")}</span>
                        ) : (
                          <div className="flex flex-col text-muted-foreground">
                            {groupNames.map((n, i) => (
                              <span key={i} className="max-w-[220px] truncate">{n}</span>
                            ))}
                            {s.groupIds.length > 2 && (
                              <span className="text-[11px] text-muted-foreground">+{s.groupIds.length - 2}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color: s.balance > 0 ? "#16a34a" : s.balance < 0 ? "#dc2626" : "#94a3b8",
                        }}
                      >
                        {s.balance > 0 ? "+" : ""}{formatMoney(s.balance, lang)}
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded-md px-2 py-1 text-[11px] font-medium", studentStatusClass(s.status))}>
                          {t(`status.${s.status}`)}
                        </span>
                      </TableCell>
                      <TableCell style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          title={lang === "uz" ? "Ko'rish" : "Открыть"}
                          onClick={() => setSelectedId(s.id)}
                          style={{ padding: "4px 8px", borderRadius: 6, color: "#0077b6", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              {lang === "ru" ? `Всего: ${totalCount}` : `Jami: ${totalCount}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || pageLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(totalCount / PAGE_SIZE) || pageLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CreateStudentSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(payload) => {
          const created = addStudent(payload);
          toast.success(t("students.created"));
          setCreateOpen(false);
          setSelectedId(created.id);
        }}
      />

      <StudentDetailSheet
        student={selected}
        onClose={() => setSelectedId(null)}
        onArchive={(id) => {
          archiveStudent(id);
          toast.success(t("students.archived"));
          setSelectedId(null);
        }}
        onDelete={(id, deleteParent) => {
          deleteStudent(id, deleteParent);
          toast.success("O'quvchi o'chirildi");
          setSelectedId(null);
        }}
      />
    </PageShell>
  );
}
