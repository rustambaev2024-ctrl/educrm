import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { Calendar, CheckCircle2, Clock3, GraduationCap, Layers, MessageSquarePlus, Phone, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { PhoneInput } from "@/components/edu/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { leadApi, studentApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import type { StudentLead, StudentLeadSource, StudentLeadStatus } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { CreateStudentSheet } from "./students";

export const Route = createFileRoute("/admin/leads")({ component: AdminLeadsPage });

type LeadRaw = {
  id: string;
  full_name: string;
  phone: string;
  branch?: string | { id: string } | null;
  interested_course?: string | { id: string } | null;
  source: StudentLeadSource;
  status: StudentLeadStatus;
  next_follow_up?: string | null;
  notes?: string | null;
  trial_lesson_date?: string | null;
  trial_lesson_attended?: boolean | null;
  trial_lesson_group?: string | { id: string } | null;
  trial_lesson_group_name?: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
};

type LeadForm = {
  fullName: string;
  phone: string;
  branchId: string;
  interestedCourseId: string;
  source: StudentLeadSource;
  status: StudentLeadStatus;
  nextFollowUp: string;
  notes: string;
};

type FilterStatus = StudentLeadStatus | "all";
type FilterSource = StudentLeadSource | "all";

const STATUS_OPTIONS: StudentLeadStatus[] = ["new", "contacted", "trial", "won", "lost"];
const SOURCE_OPTIONS: StudentLeadSource[] = ["walk_in", "phone", "telegram", "instagram", "referral", "other"];
const NONE = "__none__";

const emptyForm: LeadForm = {
  fullName: "",
  phone: "",
  branchId: "",
  interestedCourseId: NONE,
  source: "walk_in",
  status: "new",
  nextFollowUp: "",
  notes: "",
};

function extractId(value: string | { id: string } | null | undefined) {
  if (!value) return "";
  return typeof value === "string" ? value : value.id;
}

function toResults<T>(data: { results: T[] } | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

function mapLead(raw: LeadRaw): StudentLead {
  return {
    id: raw.id,
    fullName: raw.full_name,
    phone: raw.phone,
    branchId: extractId(raw.branch) || undefined,
    interestedCourseId: extractId(raw.interested_course) || undefined,
    source: raw.source,
    status: raw.status,
    nextFollowUp: raw.next_follow_up ?? undefined,
    notes: raw.notes ?? "",
    trialLessonDate: raw.trial_lesson_date ?? null,
    trialLessonAttended: raw.trial_lesson_attended ?? null,
    trialLessonGroup: extractId(raw.trial_lesson_group) || null,
    trialLessonGroupName: raw.trial_lesson_group_name ?? null,
    createdByName: raw.created_by_name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function payloadFromForm(form: LeadForm) {
  return {
    full_name: form.fullName.trim(),
    phone: form.phone.trim(),
    branch: form.branchId || null,
    interested_course: form.interestedCourseId === NONE ? null : form.interestedCourseId,
    source: form.source,
    status: form.status,
    next_follow_up: form.nextFollowUp || null,
    notes: form.notes.trim(),
  };
}

function formFromLead(lead: StudentLead): LeadForm {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    branchId: lead.branchId ?? "",
    interestedCourseId: lead.interestedCourseId ?? NONE,
    source: lead.source,
    status: lead.status,
    nextFollowUp: lead.nextFollowUp ?? "",
    notes: lead.notes,
  };
}

function AdminLeadsPage() {
  const { lang } = useI18n();
  const { branches, courses, groups, reload } = useData();
  const [leads, setLeads] = useState<StudentLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [detailForm, setDetailForm] = useState<LeadForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<FilterSource>("all");
  const [convertSheetOpen, setConvertSheetOpen] = useState(false);
  const [trialDialog, setTrialDialog] = useState<{ lead: StudentLead | null; date: string; groupId: string }>({
    lead: null,
    date: "",
    groupId: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      
      // Allow vertical scrolling inside the columns
      const target = e.target as HTMLElement | null;
      if (target && target.closest(".kanban-column-scroll")) {
        return; 
      }
      
      e.preventDefault();
      el.scrollTo({ left: el.scrollLeft + e.deltaY * 2, behavior: "auto" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const t = labels(lang);
  const selected = useMemo(() => leads.find((lead) => lead.id === selectedId) ?? null, [leads, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDetailForm(formFromLead(selected));
  }, [selected]);

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const data = await leadApi.list() as { results: LeadRaw[] } | LeadRaw[];
      setLeads(toResults(data).map(mapLead));
    } catch (err) {
      console.error("[leads] load failed", err);
      toast.error(t.loadError);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const branchById = useMemo(() => Object.fromEntries(branches.map((branch) => [branch.id, branch])), [branches]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
      if (!q) return true;
      const courseName = lead.interestedCourseId ? courseById[lead.interestedCourseId]?.name ?? "" : "";
      return (
        lead.fullName.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.notes.toLowerCase().includes(q) ||
        courseName.toLowerCase().includes(q)
      );
    });
  }, [courseById, leads, search, sourceFilter, statusFilter]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueFollowUps = leads.filter((lead) => {
    if (!lead.nextFollowUp || lead.status === "won" || lead.status === "lost") return false;
    return new Date(`${lead.nextFollowUp}T00:00:00`).getTime() <= today.getTime();
  }).length;

  const openCreate = () => {
    setForm({ ...emptyForm, branchId: branches[0]?.id ?? "" });
    setCreateOpen(true);
  };

  const createLead = async () => {
    if (!form.fullName.trim() || !form.phone.trim()) {
      toast.error(t.required);
      return;
    }

    try {
      const raw = await leadApi.create(payloadFromForm(form)) as LeadRaw;
      const created = mapLead(raw);
      setLeads((prev) => [created, ...prev]);
      setCreateOpen(false);
      setSelectedId(created.id);
      toast.success(t.created);
    } catch (err) {
      console.error("[leads] create failed", err);
      toast.error(t.saveError);
    }
  };

  const updateLead = async (leadId: string, patch: Partial<LeadForm>) => {
    const nextForm = { ...detailForm, ...patch };
    const raw = await leadApi.update(leadId, payloadFromForm(nextForm)) as LeadRaw;
    const updated = mapLead(raw);
    setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
    setDetailForm(formFromLead(updated));
    return updated;
  };

  // Частичный PATCH сырыми snake_case полями (для trial-полей, не входящих в LeadForm)
  const patchLeadRaw = async (leadId: string, patch: Record<string, unknown>) => {
    const raw = await leadApi.update(leadId, patch) as LeadRaw;
    const updated = mapLead(raw);
    setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
    return updated;
  };

  const openConvertDialog = (leadId: string) => {
    setSelectedId(leadId);
    setConvertSheetOpen(true);
  };

  const saveTrialDialog = async () => {
    if (!trialDialog.lead) return;
    if (!trialDialog.date) {
      toast.error(lang === "uz" ? "Sanani tanlang" : "Выберите дату");
      return;
    }
    try {
      await patchLeadRaw(trialDialog.lead.id, {
        status: "trial",
        trial_lesson_date: trialDialog.date,
        trial_lesson_group: trialDialog.groupId || null,
      });
      toast.success(lang === "uz" ? "Sinov darsi tayinlandi" : "Пробный урок назначен");
      setTrialDialog({ lead: null, date: "", groupId: "" });
    } catch (err) {
      console.error("[leads] trial save failed", err);
      toast.error(t.saveError);
    }
  };

  const handleTrialAttendance = async (leadId: string, attended: boolean) => {
    try {
      await patchLeadRaw(leadId, { trial_lesson_attended: attended });
      if (attended) {
        toast.success(
          lang === "uz"
            ? "Keldi! O'quvchiga o'tkazishni xohlaysizmi?"
            : "Пришёл! Хотите конвертировать в студента?",
          {
            action: {
              label: lang === "uz" ? "O'tkazish" : "Конвертировать",
              onClick: () => openConvertDialog(leadId),
            },
            duration: 8000,
          },
        );
      }
    } catch (err) {
      console.error("[leads] trial attendance failed", err);
      toast.error(t.saveError);
    }
  };

  const saveSelected = async () => {
    if (!selected) return;
    if (!detailForm.fullName.trim() || !detailForm.phone.trim()) {
      toast.error(t.required);
      return;
    }
    try {
      await updateLead(selected.id, {});
      toast.success(t.saved);
    } catch (err) {
      console.error("[leads] update failed", err);
      toast.error(t.saveError);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      lang === "uz"
        ? `"${selected.fullName}" murojaatini o'chirishni tasdiqlaysizmi?`
        : `Удалить заявку "${selected.fullName}"? Это действие нельзя отменить.`,
    );
    if (!confirmed) return;
    try {
      await leadApi.delete(selected.id);
      setLeads((prev) => prev.filter((lead) => lead.id !== selected.id));
      setSelectedId(null);
      toast.success(t.deleted);
    } catch (err) {
      console.error("[leads] delete failed", err);
      toast.error(t.saveError);
    }
  };

  const handleConvertSubmit = async (payload: any) => {
    if (!selected) return;
    try {
      await leadApi.convert(selected.id, {
        password: payload.password,
        full_name: payload.fullName,
        phone: payload.phone,
        branch_id: payload.branchId,
        date_of_birth: payload.birthDate,
        parent_name: payload.parentName,
        parent_phone: payload.parentPhone,
        parent_password: payload.parentPassword,
      });
      await updateLead(selected.id, { status: "won" });
      await reload();
      toast.success(t.converted);
      setConvertSheetOpen(false);
      setSelectedId(null);
    } catch (err) {
      console.error("[leads] convert failed", err);
      toast.error(t.convertError);
    }
  };

  return (
    <PageShell
      title={t.title}
      subtitle={t.subtitle}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={openCreate}>
          <Plus className="size-3.5" /> {t.add}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard icon={MessageSquarePlus} label={t.kpiAll} value={leads.length} iconColor="blue" />
          <KpiCard icon={Clock3} label={t.kpiNew} value={leads.filter((lead) => lead.status === "new").length} iconColor="violet" />
          <KpiCard icon={Phone} label={t.kpiFollowUp} value={dueFollowUps} iconColor={dueFollowUps > 0 ? "amber" : "blue"} />
          <KpiCard icon={CheckCircle2} label={t.kpiWon} value={leads.filter((lead) => lead.status === "won").length} iconColor="green" />
        </div>

        <Card className="shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1 xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} className="pl-9" autoComplete="off" />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 xl:flex xl:items-center">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterStatus)}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatuses}</SelectItem>
                  {STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{t.status[status]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as FilterSource)}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allSources}</SelectItem>
                  {SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{t.source[source]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs text-muted-foreground">
                {isLoading ? t.loading : `${filtered.length} / ${leads.length}`}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex gap-4 overflow-x-auto overflow-y-hidden p-4 pb-6 min-h-[520px] h-[calc(100vh-280px)]">
            {STATUS_OPTIONS.map(status => {
              const columnLeads = filtered.filter(l => l.status === status);
              const headerCls = {
                new: "bg-primary/10 text-primary border-primary/20",
                contacted: "border-[#e2e8f0] bg-white text-[#64748b]",
                trial: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                won: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                lost: "bg-destructive/10 text-red-400 border-destructive/20",
              }[status] || "bg-muted text-foreground border-border";

              return (
                <div key={status} className="flex flex-col w-72 shrink-0 rounded-2xl bg-card border border-border shadow-sm overflow-hidden h-full"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (!id) return;
                    if (status === "won") {
                      setSelectedId(id);
                      setConvertSheetOpen(true);
                    } else if (status === "trial") {
                      const lead = leads.find((l) => l.id === id) ?? null;
                      setTrialDialog({
                        lead,
                        date: lead?.trialLessonDate ? lead.trialLessonDate.slice(0, 16) : "",
                        groupId: lead?.trialLessonGroup ?? "",
                      });
                    } else {
                      await updateLead(id, { status });
                    }
                  }}
                >
                  <div className={`p-4 border-b font-semibold flex items-center justify-between ${headerCls}`}>
                    <span className="text-[15px] tracking-tight">{t.status[status]}</span>
                    <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-background/50 backdrop-blur-sm">{columnLeads.length}</Badge>
                  </div>
                  <div className="kanban-column-scroll flex flex-col gap-3 p-3 flex-1 overflow-y-auto bg-muted/20">
                    {columnLeads.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); }}
                        onClick={() => setSelectedId(lead.id)}
                        className="bg-card border border-border/60 rounded-xl p-4 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing hover:border-primary/40 transition-all"
                      >
                        <div className="font-semibold text-[15px] text-foreground leading-tight mb-1.5">{lead.fullName}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mb-3">
                          <Phone className="size-3.5" /> {lead.phone}
                        </div>
                        {lead.interestedCourseId && (
                          <div className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-md w-fit mb-3">
                            {courseById[lead.interestedCourseId]?.name}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-4 text-xs">
                          <span className="text-muted-foreground font-medium">{t.source[lead.source]}</span>
                          {isFollowUpDue(lead) ? (
                            <span className="text-orange-400 font-semibold flex items-center gap-1.5 bg-orange-500/10 px-2 py-1 rounded-md">
                              <Clock3 className="size-3.5" /> {lead.nextFollowUp ? formatDate(lead.nextFollowUp, lang) : "!"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                              {lead.nextFollowUp ? <><Clock3 className="size-3.5 opacity-50" /> {formatDate(lead.nextFollowUp, lang)}</> : ""}
                            </span>
                          )}
                        </div>

                        {lead.status === "trial" && (
                          <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                            {lead.trialLessonDate && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(lead.trialLessonDate, lang)}
                                {" · "}
                                {new Date(lead.trialLessonDate).toLocaleTimeString(lang === "uz" ? "uz" : "ru", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            )}
                            {lead.trialLessonGroupName && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Layers className="h-3 w-3" />
                                {lead.trialLessonGroupName}
                              </div>
                            )}
                            {lead.trialLessonAttended === null || lead.trialLessonAttended === undefined ? (
                              <div className="flex gap-1.5 mt-2">
                                <Button
                                  size="sm"
                                  className="h-6 text-[11px] flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleTrialAttendance(lead.id, true);
                                  }}
                                >
                                  {lang === "uz" ? "Keldi" : "Пришёл"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] flex-1 border-destructive/50 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleTrialAttendance(lead.id, false);
                                  }}
                                >
                                  {lang === "uz" ? "Kelmadi" : "Не пришёл"}
                                </Button>
                              </div>
                            ) : (
                              <div className={`text-xs font-medium mt-1 ${lead.trialLessonAttended ? "text-emerald-600" : "text-destructive"}`}>
                                {lead.trialLessonAttended
                                  ? (lang === "uz" ? "Keldi" : "Пришёл")
                                  : (lang === "uz" ? "Kelmadi" : "Не пришёл")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {columnLeads.length === 0 && (
                      <div className="text-sm text-muted-foreground/60 font-medium text-center py-8">{t.empty}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <LeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        onChange={setForm}
        branches={branches}
        courses={courses}
        labels={t}
        onSubmit={createLead}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.fullName ?? t.detailTitle}</SheetTitle>
            <SheetDescription>{t.detailSubtitle}</SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            <LeadFormFields form={detailForm} onChange={setDetailForm} branches={branches} courses={courses} labels={t} />
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium">{t.noteTitle}</div>
              <div className="mt-1 text-muted-foreground">{selected?.notes || t.noNotes}</div>
            </div>
          </div>

          <SheetFooter className="mt-6 gap-2 sm:justify-between sm:space-x-0">
            <Button variant="destructive" onClick={deleteSelected}>
              <Trash2 className="mr-1 size-4" /> {t.delete}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setConvertSheetOpen(true)} disabled={!selected || selected.status === "won"}>
                <UserPlus className="mr-1 size-4" /> {t.convert}
              </Button>
              <Button onClick={saveSelected}>{t.save}</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {selected && (
        <CreateStudentSheet
          open={convertSheetOpen}
          onOpenChange={setConvertSheetOpen}
          onCreate={handleConvertSubmit}
          initialData={{
            fullName: selected.fullName,
            phone: selected.phone,
            branchId: selected.branchId,
          }}
        />
      )}

      <Dialog
        open={!!trialDialog.lead}
        onOpenChange={(open) => !open && setTrialDialog({ lead: null, date: "", groupId: "" })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "uz" ? "Sinov darsi tayinlash" : "Назначить пробный урок"}</DialogTitle>
            <DialogDescription>{trialDialog.lead?.fullName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Sana va vaqt" : "Дата и время"}</Label>
              <Input
                type="datetime-local"
                value={trialDialog.date}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setTrialDialog((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "uz" ? "Guruh" : "Группа"}</Label>
              <Select
                value={trialDialog.groupId || NONE}
                onValueChange={(v) => setTrialDialog((prev) => ({ ...prev, groupId: v === NONE ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang === "uz" ? "Tanlanmagan" : "Не выбрано"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{lang === "uz" ? "Tanlanmagan" : "Не выбрано"}</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialog({ lead: null, date: "", groupId: "" })}>
              {t.cancel}
            </Button>
            <Button onClick={saveTrialDialog}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function LeadDialog({
  open,
  onOpenChange,
  form,
  onChange,
  branches,
  courses,
  labels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadForm;
  onChange: (form: LeadForm) => void;
  branches: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  labels: any;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.addTitle}</DialogTitle>
          <DialogDescription>{labels.addDescription}</DialogDescription>
        </DialogHeader>
        <LeadFormFields form={form} onChange={onChange} branches={branches} courses={courses} labels={labels} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
          <Button onClick={onSubmit}>{labels.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadFormFields({
  form,
  onChange,
  branches,
  courses,
  labels,
}: {
  form: LeadForm;
  onChange: (form: LeadForm) => void;
  branches: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  labels: any;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{labels.fullName}</Label>
          <Input value={form.fullName} onChange={(event) => onChange({ ...form, fullName: event.target.value })} placeholder={labels.fullNamePlaceholder} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.phone}</Label>
          <PhoneInput value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{labels.branch}</Label>
          <Select value={form.branchId || NONE} onValueChange={(value) => onChange({ ...form, branchId: value === NONE ? "" : value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{labels.notSelected}</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.course}</Label>
          <Select value={form.interestedCourseId} onValueChange={(value) => onChange({ ...form, interestedCourseId: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{labels.notSelected}</SelectItem>
              {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{labels.sourceLabel}</Label>
          <Select value={form.source} onValueChange={(value) => onChange({ ...form, source: value as StudentLeadSource })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{labels.source[source]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.statusLabel}</Label>
          <Select value={form.status} onValueChange={(value) => onChange({ ...form, status: value as StudentLeadStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{labels.status[status]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.nextFollowUp}</Label>
          <Input type="date" value={form.nextFollowUp} onChange={(event) => onChange({ ...form, nextFollowUp: event.target.value })} autoComplete="off" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{labels.notes}</Label>
        <Textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} placeholder={labels.notesPlaceholder} rows={4} />
      </div>
    </div>
  );
}

function LeadStatusBadge({ status, labels }: { status: StudentLeadStatus; labels: Record<StudentLeadStatus, string> }) {
  const cls = {
    new: "border-primary/30 bg-primary/10 text-primary",
    contacted: "border-[#e2e8f0] bg-white text-[#64748b]",
    trial: "border-warning/30 bg-warning/10 text-warning-foreground",
    won: "border-success/30 bg-success/10 text-success",
    lost: "border-destructive/30 bg-destructive/10 text-destructive",
  }[status];
  return <Badge variant="outline" className={cls}>{labels[status]}</Badge>;
}

function isFollowUpDue(lead: StudentLead) {
  if (!lead.nextFollowUp || lead.status === "won" || lead.status === "lost") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${lead.nextFollowUp}T00:00:00`).getTime() <= today.getTime();
}

function labels(lang: "uz" | "ru") {
  if (lang === "ru") {
    return {
      title: "Заявки",
      subtitle: "Потенциальные ученики, которые пришли узнать о курсах",
      add: "Новая заявка",
      addTitle: "Новая заявка",
      addDescription: "Запишите данные человека, даже если он ещё не решил учиться.",
      search: "Поиск по имени, телефону, курсу или заметке...",
      loading: "Загрузка...",
      empty: "Заявки не найдены",
      allStatuses: "Все статусы",
      allSources: "Все источники",
      kpiAll: "Всего заявок",
      kpiNew: "Новые",
      kpiFollowUp: "Нужно связаться",
      kpiWon: "Записались",
      colName: "Ф.И.О. и телефон",
      colCourse: "Курс / филиал",
      colStatus: "Статус",
      colSource: "Источник",
      colFollowUp: "Следующий контакт",
      colCreated: "Создано",
      detailTitle: "Заявка",
      detailSubtitle: "Измените статус, дату контакта или переведите заявку в ученика.",
      fullName: "Ф.И.О.",
      fullNamePlaceholder: "Например: Алиев Шахзод",
      phone: "Телефон",
      branch: "Филиал",
      course: "Интересующий курс",
      sourceLabel: "Источник",
      statusLabel: "Статус",
      nextFollowUp: "Следующий контакт",
      notes: "Заметки",
      notesPlaceholder: "Что интересовало, когда перезвонить, кто общался...",
      noteTitle: "Текущая заметка",
      noNotes: "Заметок пока нет",
      notSelected: "Не выбрано",
      cancel: "Отмена",
      create: "Сохранить заявку",
      save: "Сохранить",
      delete: "Удалить",
      convert: "Создать ученика",
      required: "Заполните Ф.И.О. и телефон",
      created: "Заявка сохранена",
      saved: "Заявка обновлена",
      deleted: "Заявка удалена",
      converted: "Ученик создан, заявка закрыта",
      loadError: "Не удалось загрузить заявки",
      saveError: "Не удалось сохранить заявку",
      convertError: "Не удалось создать ученика",
      branchRequired: "Для создания ученика укажите филиал",
      status: {
        new: "Новая",
        contacted: "Связались",
        trial: "Пробный урок",
        won: "Записался",
        lost: "Отказался",
      },
      source: {
        walk_in: "Пришёл в центр",
        phone: "Звонок",
        telegram: "Telegram",
        instagram: "Instagram",
        referral: "Рекомендация",
        other: "Другое",
      },
    };
  }

  return {
    title: "Murojaatlar",
    subtitle: "Kurslar bilan tanishishga kelgan potensial o'quvchilar",
    add: "Yangi murojaat",
    addTitle: "Yangi murojaat",
    addDescription: "Hali o'qishga qaror qilmagan odamning ma'lumotlarini yozib qo'ying.",
    search: "Ism, telefon, kurs yoki izoh bo'yicha qidirish...",
    loading: "Yuklanmoqda...",
    empty: "Murojaatlar topilmadi",
    allStatuses: "Barcha statuslar",
    allSources: "Barcha manbalar",
    kpiAll: "Jami murojaatlar",
    kpiNew: "Yangi",
    kpiFollowUp: "Bog'lanish kerak",
    kpiWon: "Yozilganlar",
    colName: "F.I.Sh. va telefon",
    colCourse: "Kurs / filial",
    colStatus: "Status",
    colSource: "Manba",
    colFollowUp: "Keyingi aloqa",
    colCreated: "Yaratilgan",
    detailTitle: "Murojaat",
    detailSubtitle: "Status, aloqa sanasi yoki o'quvchiga o'tkazishni boshqaring.",
    fullName: "F.I.Sh.",
    fullNamePlaceholder: "Masalan: Aliyev Shahzod",
    phone: "Telefon",
    branch: "Filial",
    course: "Qiziqqan kurs",
    sourceLabel: "Manba",
    statusLabel: "Status",
    nextFollowUp: "Keyingi aloqa",
    notes: "Izohlar",
    notesPlaceholder: "Nimaga qiziqdi, qachon qo'ng'iroq qilish kerak, kim gaplashdi...",
    noteTitle: "Joriy izoh",
    noNotes: "Hozircha izoh yo'q",
    notSelected: "Tanlanmagan",
    cancel: "Bekor qilish",
    create: "Murojaatni saqlash",
    save: "Saqlash",
    delete: "O'chirish",
    convert: "O'quvchi yaratish",
    required: "F.I.Sh. va telefonni to'ldiring",
    created: "Murojaat saqlandi",
    saved: "Murojaat yangilandi",
    deleted: "Murojaat o'chirildi",
    converted: "O'quvchi yaratildi, murojaat yopildi",
    loadError: "Murojaatlarni yuklab bo'lmadi",
    saveError: "Murojaatni saqlab bo'lmadi",
    convertError: "O'quvchini yaratib bo'lmadi",
    branchRequired: "O'quvchi yaratish uchun filialni tanlang",
    status: {
      new: "Yangi",
      contacted: "Aloqa qilindi",
      trial: "Sinov darsi",
      won: "Yozildi",
      lost: "Rad etdi",
    },
    source: {
      walk_in: "Markazga keldi",
      phone: "Qo'ng'iroq",
      telegram: "Telegram",
      instagram: "Instagram",
      referral: "Tavsiya",
      other: "Boshqa",
    },
  };
}
