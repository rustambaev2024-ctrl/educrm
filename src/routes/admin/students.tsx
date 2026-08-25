import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Users, UserCheck, AlertCircle, UserPlus, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
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
import { useDebounced } from "@/lib/use-debounced";
import { useI18n } from "@/lib/i18n";
import { useData, apiErrorMessage } from "@/lib/data/store";
import { formatMoney, initialsOf } from "@/lib/format";
import { getAvatarColor } from "@/lib/avatar-color";
import type { Student, StudentStatus } from "@/lib/data/types";
import { studentApi } from "@/lib/api";
import { mapStudents } from "@/lib/data/mappers";
import { isActiveStudent, isDebtor } from "@/lib/data/definitions";
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
  const { t, lang, plural } = useI18n();
  const { students, groups, addStudent, archiveStudent, deleteStudent, isLoading } = useData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Сортировка серверная: список пагинирован по 50, поэтому сортировка
  // на клиенте отсортировала бы только текущую страницу и дала бы неверный
  // ответ на «у кого самый большой долг». Белый список полей — на бэкенде.
  const [sort, setSort] = useState<string>("");
  // Массовый выбор. Хранится по id, а не по индексу: список серверный,
  // и при смене страницы индексы указывали бы на других людей.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageStudents, setPageStudents] = useState<Student[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const PAGE_SIZE = 50;

  const debouncedSearch = useDebounced(search);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, sort]);
  // Выбор сбрасывается при любой смене выборки: иначе «выбрано 3» осталось
  // бы от людей, которых на экране уже нет.
  useEffect(() => { setPicked(new Set()); }, [debouncedSearch, statusFilter, sort, page]);

  const loadStudents = useCallback(async () => {
    setPageLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(PAGE_SIZE),
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (sort) params.sort = sort;
      const res = await studentApi.list(params) as any;
      const list = Array.isArray(res) ? res : (res.results ?? []);
      const count = res.count ?? list.length;
      setPageStudents(mapStudents(list) as Student[]);
      setTotalCount(count);
    } catch (err) {
      console.warn("[students] load failed:", err);
      toast.error(apiErrorMessage(err));
    } finally {
      setPageLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, sort]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyBulkStatus = async (next: "frozen" | "active") => {
    const ids = [...picked];
    if (ids.length === 0) return;
    // Снимок прежних статусов — для отмены. Действие обратимое, поэтому
    // выполняем сразу и даём отменить, а не спрашиваем заранее.
    const before = pageStudents
      .filter((st) => picked.has(st.id))
      .map((st) => ({ id: st.id, status: st.status }));

    setBulkBusy(true);
    try {
      const res = await studentApi.bulkStatus(ids, next);
      setPicked(new Set());
      await loadStudents();

      const label =
        next === "frozen"
          ? (lang === "uz" ? "muzlatildi" : "заморожено")
          : (lang === "uz" ? "faollashtirildi" : "активировано");

      toast.success(`${res.updated} ${lang === "uz" ? "ta o'quvchi" : "учеников"} ${label}`, {
        description:
          res.skipped > 0
            ? (lang === "uz"
                ? `${res.skipped} ta o'zgarmadi: sizning filialingizda emas`
                : `${res.skipped} не изменено: не в вашем филиале`)
            : undefined,
        action: {
          label: lang === "uz" ? "Bekor qilish" : "Отменить",
          onClick: () => {
            // Возвращаем каждому его прежний статус, а не «активен» всем.
            const groups = new Map<string, string[]>();
            before.forEach(({ id, status: was }) => {
              if (was !== "frozen" && was !== "active") return;
              const bucket = groups.get(was) ?? [];
              bucket.push(id);
              groups.set(was, bucket);
            });
            void Promise.all(
              [...groups.entries()].map(([was, list]) =>
                studentApi.bulkStatus(list, was as "frozen" | "active"),
              ),
            ).then(() => loadStudents());
          },
        },
      });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = pageStudents;

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let active = 0;
    let debtor = 0;
    let fresh = 0;
    for (const s of students) {
      // «Активный» и «должник» — по общему правилу платформы, а не по строке
      // статуса: ученик-должник продолжает учиться, а сам статус "debtor"
      // производный и умеет отставать от баланса.
      if (isActiveStudent(s)) active++;
      if (isDebtor(s)) debtor++;
      if (s.registeredAt && new Date(s.registeredAt) >= monthStart) fresh++;
    }
    return { total: students.length, active, debtor, fresh };
  }, [students]);

  const selected = useMemo(() => {
    return pageStudents.find((s) => s.id === selectedId)
      ?? students.find((s) => s.id === selectedId)
      ?? null;
  }, [students, pageStudents, selectedId]);

  const showSkeleton = isLoading && !pageStudents.length;

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
        {/* Подписи именно «Активные ученики» и «Должники», а не названия
            статусов: считается по общему правилу платформы, и должник входит
            в активных — он продолжает учиться. */}
        <KpiCard label={t("director.activeStudents")} value={kpis.active} icon={UserCheck} iconColor="green" />
        <KpiCard label={t("director.debtors")} value={kpis.debtor} icon={AlertCircle} iconColor="red" />
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
              <span className="text-xs text-muted-foreground">{totalCount} {lang === "ru" ? plural(totalCount, "ученик", "ученика", "учеников") : t("students.count")}</span>
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

          {picked.size > 0 && (
            <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-sm font-semibold tabular-nums">
                {lang === "uz" ? `${picked.size} ta belgilandi` : `Выбрано ${picked.size}`}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="edu-tap"
                disabled={bulkBusy}
                onClick={() => void applyBulkStatus("frozen")}
              >
                {lang === "uz" ? "Muzlatish" : "Заморозить"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="edu-tap"
                disabled={bulkBusy}
                onClick={() => void applyBulkStatus("active")}
              >
                {lang === "uz" ? "Faollashtirish" : "Активировать"}
              </Button>
              <button
                onClick={() => setPicked(new Set())}
                className="ml-auto min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {lang === "uz" ? "Bekor qilish" : "Снять выбор"}
              </button>
            </div>
          )}

          {showSkeleton ? (
            <ListSkeleton rows={6} />
          ) : filtered.length === 0 ? (
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
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={lang === "uz" ? "Hammasini belgilash" : "Выбрать всех на странице"}
                      checked={pageStudents.length > 0 && picked.size === pageStudents.length}
                      onCheckedChange={(v) =>
                        setPicked(v === true ? new Set(pageStudents.map((st) => st.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <SortHead field="name" sort={sort} onSort={setSort}>{lang === "uz" ? "O'quvchi" : "Ученик"}</SortHead>
                  <TableHead>{lang === "uz" ? "Guruhlar" : "Группы"}</TableHead>
                  <SortHead field="balance" sort={sort} onSort={setSort} align="right">{lang === "uz" ? "Balans" : "Баланс"}</SortHead>
                  <SortHead field="status" sort={sort} onSort={setSort}>{lang === "uz" ? "Holat" : "Статус"}</SortHead>
                  <TableHead className="text-right">{lang === "uz" ? "Amallar" : "Действия"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s, index) => {
                  const groupNames = s.groupIds
                    .map((gid) => groups.find((g) => g.id === gid)?.name)
                    .filter(Boolean)
                    .slice(0, 2);
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        index % 2 === 1 && "bg-muted/20",
                      )}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={s.fullName}
                          checked={picked.has(s.id)}
                          onCheckedChange={() => togglePick(s.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white",
                              getAvatarColor(s.fullName),
                            )}
                          >
                            {s.photo ? (
                              <img src={s.photo} alt={s.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              initialsOf(s.fullName)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{s.fullName}</div>
                            <div className="mt-px text-[11px] text-muted-foreground">{s.phone}</div>
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
                        className={`text-right font-bold tabular-nums ${s.balance > 0 ? "text-ok" : s.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}
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
                          className="edu-ghost-btn"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44, borderRadius: 6, color: "var(--brand)", background: "transparent", border: "none", cursor: "pointer" }}
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
                className="edu-tap"
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
                className="edu-tap"
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
          // addStudent — optimistic: реальный POST уходит в фоне (fireAndForget),
          // поэтому список (отдельный пагинированный запрос, в отличие от KPI-карточек
          // выше, которые читают локальный store) рефетчим с небольшой задержкой,
          // чтобы бэкенд успел закоммитить нового студента.
          if (page === 1) {
            setTimeout(loadStudents, 600);
          } else {
            setPage(1);
          }
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

/**
 * Заголовок колонки с сортировкой. Три состояния по кругу:
 * не сортировано → по возрастанию → по убыванию → снова не сортировано.
 * Направление видно и иконкой, и через aria-sort — иначе с клавиатуры
 * и через screen reader состояние неразличимо.
 */
function SortHead({
  field,
  sort,
  onSort,
  align,
  children,
}: {
  field: string;
  sort: string;
  onSort: (next: string) => void;
  align?: "right";
  children: ReactNode;
}) {
  const active = sort === field || sort === `-${field}`;
  const descending = sort === `-${field}`;

  const cycle = () => {
    if (sort === field) onSort(`-${field}`);
    else if (sort === `-${field}`) onSort("");
    else onSort(field);
  };

  return (
    <TableHead
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={cycle}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
        {active ? (
          descending ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
