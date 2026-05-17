// Director Leads page — reuses the same admin leads component logic
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MessageSquarePlus, Phone, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { PhoneInput } from "@/components/edu/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { leadApi, studentApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import type { StudentLead, StudentLeadSource, StudentLeadStatus } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/leads")({ component: DirectorLeadsPage });

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
  fullName: "", phone: "", branchId: "", interestedCourseId: NONE,
  source: "walk_in", status: "new", nextFollowUp: "", notes: "",
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
    id: raw.id, fullName: raw.full_name, phone: raw.phone,
    branchId: extractId(raw.branch) || undefined,
    interestedCourseId: extractId(raw.interested_course) || undefined,
    source: raw.source, status: raw.status,
    nextFollowUp: raw.next_follow_up ?? undefined,
    notes: raw.notes ?? "", createdByName: raw.created_by_name,
    createdAt: raw.created_at, updatedAt: raw.updated_at,
  };
}

function payloadFromForm(form: LeadForm) {
  return {
    full_name: form.fullName.trim(), phone: form.phone.trim(),
    branch: form.branchId || null,
    interested_course: form.interestedCourseId === NONE ? null : form.interestedCourseId,
    source: form.source, status: form.status,
    next_follow_up: form.nextFollowUp || null, notes: form.notes.trim(),
  };
}

function formFromLead(lead: StudentLead): LeadForm {
  return {
    fullName: lead.fullName, phone: lead.phone, branchId: lead.branchId ?? "",
    interestedCourseId: lead.interestedCourseId ?? NONE, source: lead.source,
    status: lead.status, nextFollowUp: lead.nextFollowUp ?? "", notes: lead.notes,
  };
}

function DirectorLeadsPage() {
  const { lang } = useI18n();
  const { branches, courses, reload } = useData();
  const [leads, setLeads] = useState<StudentLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [detailForm, setDetailForm] = useState<LeadForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<FilterSource>("all");

  const t = labels(lang);
  const selected = useMemo(() => leads.find((l) => l.id === selectedId) ?? null, [leads, selectedId]);

  useEffect(() => { if (selected) setDetailForm(formFromLead(selected)); }, [selected]);

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const data = await leadApi.list() as { results: LeadRaw[] } | LeadRaw[];
      setLeads(toResults(data).map(mapLead));
    } catch { toast.error(t.loadError); } finally { setIsLoading(false); }
  };

  useEffect(() => { void loadLeads(); }, []);

  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b])), [branches]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (!q) return true;
      const cn = l.interestedCourseId ? courseById[l.interestedCourseId]?.name ?? "" : "";
      return l.fullName.toLowerCase().includes(q) || l.phone.includes(q) || l.notes.toLowerCase().includes(q) || cn.toLowerCase().includes(q);
    });
  }, [courseById, leads, search, sourceFilter, statusFilter]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueFollowUps = leads.filter((l) => {
    if (!l.nextFollowUp || l.status === "won" || l.status === "lost") return false;
    return new Date(`${l.nextFollowUp}T00:00:00`).getTime() <= today.getTime();
  }).length;

  const openCreate = () => { setForm({ ...emptyForm, branchId: branches[0]?.id ?? "" }); setCreateOpen(true); };

  const createLead = async () => {
    if (!form.fullName.trim() || !form.phone.trim()) { toast.error(t.required); return; }
    try {
      const raw = await leadApi.create(payloadFromForm(form)) as LeadRaw;
      const created = mapLead(raw);
      setLeads((p) => [created, ...p]); setCreateOpen(false); setSelectedId(created.id);
      toast.success(t.created);
    } catch { toast.error(t.saveError); }
  };

  const updateLead = async (id: string, patch: Partial<LeadForm>) => {
    const next = { ...detailForm, ...patch };
    const raw = await leadApi.update(id, payloadFromForm(next)) as LeadRaw;
    const updated = mapLead(raw);
    setLeads((p) => p.map((l) => (l.id === updated.id ? updated : l)));
    setDetailForm(formFromLead(updated));
    return updated;
  };

  const saveSelected = async () => {
    if (!selected) return;
    if (!detailForm.fullName.trim() || !detailForm.phone.trim()) { toast.error(t.required); return; }
    try { await updateLead(selected.id, {}); toast.success(t.saved); } catch { toast.error(t.saveError); }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    try { await leadApi.delete(selected.id); setLeads((p) => p.filter((l) => l.id !== selected.id)); setSelectedId(null); toast.success(t.deleted); } catch { toast.error(t.saveError); }
  };

  const convertSelected = async () => {
    if (!selected) return;
    if (!selected.branchId) { toast.error(t.branchRequired); return; }
    try {
      await leadApi.convert(selected.id);
      await updateLead(selected.id, { status: "won" }); await reload();
      toast.success(t.converted);
    } catch { toast.error(t.convertError); }
  };

  return (
    <>
      <PageHeader title={t.title} description={t.subtitle} actions={<Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground shadow-elegant"><Plus className="mr-1 size-4" /> {t.add}</Button>} />
      <div className="space-y-5 p-4 md:p-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={MessageSquarePlus} label={t.kpiAll} value={String(leads.length)} />
          <Kpi icon={Clock3} label={t.kpiNew} value={String(leads.filter((l) => l.status === "new").length)} />
          <Kpi icon={Phone} label={t.kpiFollowUp} value={String(dueFollowUps)} tone={dueFollowUps > 0 ? "warning" : "default"} />
          <Kpi icon={CheckCircle2} label={t.kpiWon} value={String(leads.filter((l) => l.status === "won").length)} tone="success" />
        </div>
        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1 xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} className="pl-9" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:flex xl:items-center">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatuses}</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{t.status[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as FilterSource)}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allSources}</SelectItem>
                  {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{t.source[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs text-muted-foreground">
                {isLoading ? t.loading : `${filtered.length} / ${leads.length}`}
              </div>
            </div>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t.colName}</TableHead><TableHead>{t.colCourse}</TableHead><TableHead>{t.colStatus}</TableHead>
              <TableHead>{t.colSource}</TableHead><TableHead>{t.colFollowUp}</TableHead><TableHead>{t.colCreated}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</TableCell></TableRow>
              ) : filtered.map((l) => (
                <TableRow key={l.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setSelectedId(l.id)}>
                  <TableCell><div className="font-medium">{l.fullName}</div><div className="text-xs text-muted-foreground">{l.phone}</div></TableCell>
                  <TableCell><div className="text-sm">{l.interestedCourseId ? courseById[l.interestedCourseId]?.name ?? "-" : "-"}</div><div className="text-xs text-muted-foreground">{l.branchId ? branchById[l.branchId]?.name ?? "-" : "-"}</div></TableCell>
                  <TableCell><LeadStatusBadge status={l.status} labels={t.status} /></TableCell>
                  <TableCell><Badge variant="outline">{t.source[l.source]}</Badge></TableCell>
                  <TableCell className={isFollowUpDue(l) ? "font-semibold text-warning-foreground" : "text-muted-foreground"}>{l.nextFollowUp ? formatDate(l.nextFollowUp, lang) : "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(l.createdAt, lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t.addTitle}</DialogTitle><DialogDescription>{t.addDescription}</DialogDescription></DialogHeader>
          <LeadFormFields form={form} onChange={setForm} branches={branches} courses={courses} labels={t} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button onClick={createLead}>{t.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>{selected?.fullName ?? t.detailTitle}</SheetTitle><SheetDescription>{t.detailSubtitle}</SheetDescription></SheetHeader>
          <div className="mt-5 space-y-4">
            <LeadFormFields form={detailForm} onChange={setDetailForm} branches={branches} courses={courses} labels={t} />
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium">{t.noteTitle}</div>
              <div className="mt-1 text-muted-foreground">{selected?.notes || t.noNotes}</div>
            </div>
          </div>
          <SheetFooter className="mt-6 gap-2 sm:justify-between sm:space-x-0">
            <Button variant="destructive" onClick={deleteSelected}><Trash2 className="mr-1 size-4" /> {t.delete}</Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={convertSelected} disabled={!selected || selected.status === "won"}><UserPlus className="mr-1 size-4" /> {t.convert}</Button>
              <Button onClick={saveSelected}>{t.save}</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function LeadFormFields({ form, onChange, branches, courses, labels: t }: {
  form: LeadForm; onChange: (f: LeadForm) => void;
  branches: Array<{ id: string; name: string }>; courses: Array<{ id: string; name: string }>;
  labels: ReturnType<typeof labels>;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><Label>{t.fullName}</Label><Input value={form.fullName} onChange={(e) => onChange({ ...form, fullName: e.target.value })} placeholder={t.fullNamePlaceholder} /></div>
        <div className="space-y-1.5"><Label>{t.phone}</Label><PhoneInput value={form.phone} onChange={(e) => onChange({ ...form, phone: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><Label>{t.branch}</Label>
          <Select value={form.branchId || NONE} onValueChange={(v) => onChange({ ...form, branchId: v === NONE ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>{t.notSelected}</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t.course}</Label>
          <Select value={form.interestedCourseId} onValueChange={(v) => onChange({ ...form, interestedCourseId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>{t.notSelected}</SelectItem>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5"><Label>{t.sourceLabel}</Label>
          <Select value={form.source} onValueChange={(v) => onChange({ ...form, source: v as StudentLeadSource })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{t.source[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t.statusLabel}</Label>
          <Select value={form.status} onValueChange={(v) => onChange({ ...form, status: v as StudentLeadStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{t.status[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t.nextFollowUp}</Label><Input type="date" value={form.nextFollowUp} onChange={(e) => onChange({ ...form, nextFollowUp: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5"><Label>{t.notes}</Label><Textarea value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} placeholder={t.notesPlaceholder} rows={4} /></div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: { icon: typeof Clock3; label: string; value: string; tone?: "default" | "warning" | "success" }) {
  const cls = { default: "bg-primary/15 text-primary", warning: "bg-warning/15 text-warning-foreground", success: "bg-success/15 text-success" }[tone];
  return (<Card className="p-4 shadow-elegant"><div className={`flex size-9 items-center justify-center rounded-lg ${cls}`}><Icon className="size-4" /></div><div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></Card>);
}

function LeadStatusBadge({ status, labels }: { status: StudentLeadStatus; labels: Record<StudentLeadStatus, string> }) {
  const cls = { new: "border-primary/30 bg-primary/10 text-primary", contacted: "border-blue-500/30 bg-blue-500/10 text-blue-400", trial: "border-warning/30 bg-warning/10 text-warning-foreground", won: "border-success/30 bg-success/10 text-success", lost: "border-destructive/30 bg-destructive/10 text-destructive" }[status];
  return <Badge variant="outline" className={cls}>{labels[status]}</Badge>;
}

function isFollowUpDue(lead: StudentLead) {
  if (!lead.nextFollowUp || lead.status === "won" || lead.status === "lost") return false;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return new Date(`${lead.nextFollowUp}T00:00:00`).getTime() <= d.getTime();
}

function labels(lang: "uz" | "ru") {
  if (lang === "ru") return {
    title: "Заявки", subtitle: "Потенциальные ученики, которые пришли узнать о курсах",
    add: "Новая заявка", addTitle: "Новая заявка", addDescription: "Запишите данные человека, даже если он ещё не решил учиться.",
    search: "Поиск по имени, телефону, курсу или заметке...", loading: "Загрузка...", empty: "Заявки не найдены",
    allStatuses: "Все статусы", allSources: "Все источники",
    kpiAll: "Всего заявок", kpiNew: "Новые", kpiFollowUp: "Нужно связаться", kpiWon: "Записались",
    colName: "Ф.И.О. и телефон", colCourse: "Курс / филиал", colStatus: "Статус", colSource: "Источник", colFollowUp: "Следующий контакт", colCreated: "Создано",
    detailTitle: "Заявка", detailSubtitle: "Измените статус, дату контакта или переведите заявку в ученика.",
    fullName: "Ф.И.О.", fullNamePlaceholder: "Например: Алиев Шахзод", phone: "Телефон", branch: "Филиал", course: "Интересующий курс",
    sourceLabel: "Источник", statusLabel: "Статус", nextFollowUp: "Следующий контакт",
    notes: "Заметки", notesPlaceholder: "Что интересовало, когда перезвонить, кто общался...",
    noteTitle: "Текущая заметка", noNotes: "Заметок пока нет", notSelected: "Не выбрано",
    cancel: "Отмена", create: "Сохранить заявку", save: "Сохранить", delete: "Удалить", convert: "Создать ученика",
    required: "Заполните Ф.И.О. и телефон", created: "Заявка сохранена", saved: "Заявка обновлена", deleted: "Заявка удалена",
    converted: "Ученик создан, заявка закрыта", loadError: "Не удалось загрузить заявки", saveError: "Не удалось сохранить заявку",
    convertError: "Не удалось создать ученика", branchRequired: "Для создания ученика укажите филиал",
    status: { new: "Новая", contacted: "Связались", trial: "Пробный урок", won: "Записался", lost: "Отказался" } as Record<StudentLeadStatus, string>,
    source: { walk_in: "Пришёл в центр", phone: "Звонок", telegram: "Telegram", instagram: "Instagram", referral: "Рекомендация", other: "Другое" } as Record<StudentLeadSource, string>,
  };
  return {
    title: "Murojaatlar", subtitle: "Kurslar bilan tanishishga kelgan potensial o'quvchilar",
    add: "Yangi murojaat", addTitle: "Yangi murojaat", addDescription: "Hali o'qishga qaror qilmagan odamning ma'lumotlarini yozib qo'ying.",
    search: "Ism, telefon, kurs yoki izoh bo'yicha qidirish...", loading: "Yuklanmoqda...", empty: "Murojaatlar topilmadi",
    allStatuses: "Barcha statuslar", allSources: "Barcha manbalar",
    kpiAll: "Jami murojaatlar", kpiNew: "Yangi", kpiFollowUp: "Bog'lanish kerak", kpiWon: "Yozilganlar",
    colName: "F.I.Sh. va telefon", colCourse: "Kurs / filial", colStatus: "Status", colSource: "Manba", colFollowUp: "Keyingi aloqa", colCreated: "Yaratilgan",
    detailTitle: "Murojaat", detailSubtitle: "Status, aloqa sanasi yoki o'quvchiga o'tkazishni boshqaring.",
    fullName: "F.I.Sh.", fullNamePlaceholder: "Masalan: Aliyev Shahzod", phone: "Telefon", branch: "Filial", course: "Qiziqqan kurs",
    sourceLabel: "Manba", statusLabel: "Status", nextFollowUp: "Keyingi aloqa",
    notes: "Izohlar", notesPlaceholder: "Nimaga qiziqdi, qachon qo'ng'iroq qilish kerak, kim gaplashdi...",
    noteTitle: "Joriy izoh", noNotes: "Hozircha izoh yo'q", notSelected: "Tanlanmagan",
    cancel: "Bekor qilish", create: "Murojaatni saqlash", save: "Saqlash", delete: "O'chirish", convert: "O'quvchi yaratish",
    required: "F.I.Sh. va telefonni to'ldiring", created: "Murojaat saqlandi", saved: "Murojaat yangilandi", deleted: "Murojaat o'chirildi",
    converted: "O'quvchi yaratildi, murojaat yopildi", loadError: "Murojaatlarni yuklab bo'lmadi", saveError: "Murojaatni saqlab bo'lmadi",
    convertError: "O'quvchini yaratib bo'lmadi", branchRequired: "O'quvchi yaratish uchun filialni tanlang",
    status: { new: "Yangi", contacted: "Aloqa qilindi", trial: "Sinov darsi", won: "Yozildi", lost: "Rad etdi" } as Record<StudentLeadStatus, string>,
    source: { walk_in: "Markazga keldi", phone: "Qo'ng'iroq", telegram: "Telegram", instagram: "Instagram", referral: "Tavsiya", other: "Boshqa" } as Record<StudentLeadSource, string>,
  };
}
