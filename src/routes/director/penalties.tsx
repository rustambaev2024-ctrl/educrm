import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, CalendarDays, CircleMinus, Edit3, Plus, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/lib/data/store";
import type { StaffPenalty, StaffPenaltyStatus } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/penalties")({ component: DirectorPenaltiesPage });

type FormState = {
  staffId: string;
  branchId: string;
  amount: string;
  reason: string;
  penaltyDate: string;
  status: StaffPenaltyStatus;
  comment: string;
};

type StatusFilter = StaffPenaltyStatus | "all";

const emptyForm: FormState = {
  staffId: "",
  branchId: "",
  amount: "",
  reason: "",
  penaltyDate: new Date().toISOString().slice(0, 10),
  status: "active",
  comment: "",
};

function DirectorPenaltiesPage() {
  const { lang, t } = useI18n();
  const { staff, branches, penalties, addPenalty, updatePenalty, deletePenalty } = useData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [detailForm, setDetailForm] = useState<FormState>(emptyForm);

  const labels = pageLabels(lang);
  const staffList = useMemo(() => staff.filter((item) => item.role !== "director"), [staff]);
  const staffById = useMemo(() => Object.fromEntries(staff.map((item) => [item.id, item])), [staff]);
  const branchById = useMemo(() => Object.fromEntries(branches.map((item) => [item.id, item])), [branches]);
  const selected = useMemo(() => penalties.find((item) => item.id === selectedId) ?? null, [penalties, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return penalties.filter((penalty) => {
      const member = staffById[penalty.staffId];
      if (status !== "all" && penalty.status !== status) return false;
      if (branchId !== "all" && penalty.branchId !== branchId) return false;
      if (month && !penalty.penaltyDate.startsWith(month)) return false;
      if (!q) return true;
      return (
        penalty.reason.toLowerCase().includes(q) ||
        penalty.comment?.toLowerCase().includes(q) ||
        member?.fullName.toLowerCase().includes(q) ||
        member?.phone.includes(q)
      );
    });
  }, [branchId, month, penalties, search, staffById, status]);

  const totals = useMemo(() => {
    const active = filtered.filter((penalty) => penalty.status === "active");
    return {
      all: filtered.length,
      active: active.length,
      cancelled: filtered.filter((penalty) => penalty.status === "cancelled").length,
      amount: active.reduce((sum, penalty) => sum + penalty.amount, 0),
    };
  }, [filtered]);

  const openCreate = () => {
    const firstStaff = staffList[0];
    setForm({
      ...emptyForm,
      staffId: firstStaff?.id ?? "",
      branchId: firstStaff?.branchId ?? branches[0]?.id ?? "",
      penaltyDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  const saveNew = () => {
    if (!form.staffId || !Number(form.amount) || !form.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    const member = staffById[form.staffId];
    addPenalty({
      staffId: form.staffId,
      branchId: form.branchId || member?.branchId,
      amount: Number(form.amount),
      reason: form.reason.trim(),
      penaltyDate: form.penaltyDate,
      status: form.status,
      comment: form.comment.trim() || undefined,
      createdByName: undefined,
    });
    setDialogOpen(false);
    toast.success(labels.created);
  };

  const openDetail = (penalty: StaffPenalty) => {
    setSelectedId(penalty.id);
    setDetailForm({
      staffId: penalty.staffId,
      branchId: penalty.branchId ?? "",
      amount: String(penalty.amount),
      reason: penalty.reason,
      penaltyDate: penalty.penaltyDate,
      status: penalty.status,
      comment: penalty.comment ?? "",
    });
  };

  const saveDetail = () => {
    if (!selected) return;
    if (!detailForm.staffId || !Number(detailForm.amount) || !detailForm.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    const member = staffById[detailForm.staffId];
    updatePenalty(selected.id, {
      staffId: detailForm.staffId,
      branchId: detailForm.branchId || member?.branchId,
      amount: Number(detailForm.amount),
      reason: detailForm.reason.trim(),
      penaltyDate: detailForm.penaltyDate,
      status: detailForm.status,
      comment: detailForm.comment.trim() || undefined,
    });
    toast.success(labels.saved);
  };

  const removeSelected = () => {
    if (!selected) return;
    deletePenalty(selected.id);
    setSelectedId(null);
    toast.success(labels.deleted);
  };

  return (
    <>
      <PageHeader
        title={labels.title}
        description={labels.subtitle}
        actions={
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="mr-1 size-4" /> {labels.add}
          </Button>
        }
      />

      <div className="space-y-5 p-4 md:p-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Ban} label={labels.kpiAmount} value={formatMoney(totals.amount, lang)} tone="danger" />
          <Kpi icon={CircleMinus} label={labels.kpiActive} value={String(totals.active)} />
          <Kpi icon={CalendarDays} label={labels.kpiMonth} value={month || labels.allMonths} />
          <Kpi icon={UserRound} label={labels.kpiRecords} value={String(totals.all)} />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="grid gap-3 border-b border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} className="pl-9" />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.allStatuses}</SelectItem>
                <SelectItem value="active">{labels.status.active}</SelectItem>
                <SelectItem value="cancelled">{labels.status.cancelled}</SelectItem>
              </SelectContent>
            </Select>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.allBranches}</SelectItem>
                {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.staff}</TableHead>
                <TableHead>{labels.reason}</TableHead>
                <TableHead>{labels.date}</TableHead>
                <TableHead>{labels.statusLabel}</TableHead>
                <TableHead className="text-right">{labels.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{labels.empty}</TableCell></TableRow>
              ) : filtered.map((penalty) => {
                const member = staffById[penalty.staffId];
                return (
                  <TableRow key={penalty.id} className="cursor-pointer hover:bg-accent/40" onClick={() => openDetail(penalty)}>
                    <TableCell>
                      <div className="font-medium">{member?.fullName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{penalty.branchId ? branchById[penalty.branchId]?.name ?? "-" : "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{penalty.reason}</div>
                      {penalty.comment && <div className="line-clamp-1 text-xs text-muted-foreground">{penalty.comment}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(penalty.penaltyDate, lang)}</TableCell>
                    <TableCell><StatusBadge status={penalty.status} labels={labels.status} /></TableCell>
                    <TableCell className="text-right font-semibold text-destructive">-{formatMoney(penalty.amount, lang)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <PenaltyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        staff={staffList}
        branches={branches}
        labels={labels}
        onSubmit={saveNew}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected ? staffById[selected.staffId]?.fullName ?? labels.detail : labels.detail}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <PenaltyForm form={detailForm} setForm={setDetailForm} staff={staffList} branches={branches} labels={labels} />
          </div>
          <SheetFooter className="mt-6 gap-2 sm:justify-between sm:space-x-0">
            <Button variant="destructive" onClick={removeSelected}>
              <Trash2 className="mr-1 size-4" /> {labels.delete}
            </Button>
            <Button onClick={saveDetail}>
              <Edit3 className="mr-1 size-4" /> {labels.save}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PenaltyDialog({
  open,
  onOpenChange,
  form,
  setForm,
  staff,
  branches,
  labels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: (form: FormState) => void;
  staff: Array<{ id: string; fullName: string; branchId?: string }>;
  branches: Array<{ id: string; name: string }>;
  labels: ReturnType<typeof pageLabels>;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.addTitle}</DialogTitle>
          <DialogDescription>{labels.addDescription}</DialogDescription>
        </DialogHeader>
        <PenaltyForm form={form} setForm={setForm} staff={staff} branches={branches} labels={labels} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
          <Button onClick={onSubmit}>{labels.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PenaltyForm({
  form,
  setForm,
  staff,
  branches,
  labels,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  staff: Array<{ id: string; fullName: string; branchId?: string }>;
  branches: Array<{ id: string; name: string }>;
  labels: ReturnType<typeof pageLabels>;
}) {
  const selectStaff = (staffId: string) => {
    const member = staff.find((item) => item.id === staffId);
    setForm({ ...form, staffId, branchId: member?.branchId ?? form.branchId });
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{labels.staff}</Label>
          <Select value={form.staffId} onValueChange={selectStaff}>
            <SelectTrigger><SelectValue placeholder={labels.selectStaff} /></SelectTrigger>
            <SelectContent>
              {staff.map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.branch}</Label>
          <Select value={form.branchId || "none"} onValueChange={(value) => setForm({ ...form, branchId: value === "none" ? "" : value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{labels.notSelected}</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{labels.amount}</Label>
          <Input type="number" min={0} step={1000} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.date}</Label>
          <Input type="date" value={form.penaltyDate} onChange={(event) => setForm({ ...form, penaltyDate: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.statusLabel}</Label>
          <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as StaffPenaltyStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{labels.status.active}</SelectItem>
              <SelectItem value="cancelled">{labels.status.cancelled}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{labels.reason}</Label>
        <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={labels.reasonPlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label>{labels.comment}</Label>
        <Textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder={labels.commentPlaceholder} rows={4} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: { icon: typeof Ban; label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <Card className="p-4 shadow-elegant">
      <div className={`flex size-9 items-center justify-center rounded-lg ${tone === "danger" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function StatusBadge({ status, labels }: { status: StaffPenaltyStatus; labels: Record<StaffPenaltyStatus, string> }) {
  return (
    <Badge variant="outline" className={status === "active" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-muted-foreground/30 text-muted-foreground"}>
      {labels[status]}
    </Badge>
  );
}

function pageLabels(lang: "uz" | "ru") {
  if (lang === "ru") {
    return {
      title: "Штрафы сотрудников",
      subtitle: "Удержания, которые автоматически учитываются при расчёте зарплаты",
      add: "Новый штраф",
      addTitle: "Новый штраф",
      addDescription: "Укажите сотрудника, сумму, дату и причину удержания.",
      search: "Поиск по сотруднику, телефону, причине или комментарию...",
      allStatuses: "Все статусы",
      allBranches: "Все филиалы",
      allMonths: "Все месяцы",
      kpiAmount: "Активные штрафы",
      kpiActive: "Активных записей",
      kpiMonth: "Период",
      kpiRecords: "Записей",
      staff: "Сотрудник",
      branch: "Филиал",
      reason: "Причина",
      date: "Дата",
      statusLabel: "Статус",
      amount: "Сумма",
      comment: "Комментарий",
      detail: "Штраф",
      empty: "Штрафы не найдены",
      selectStaff: "Выберите сотрудника",
      notSelected: "Не выбрано",
      reasonPlaceholder: "Например: опоздание, нарушение регламента",
      commentPlaceholder: "Дополнительные детали для директора или бухгалтера",
      cancel: "Отмена",
      create: "Сохранить штраф",
      save: "Сохранить",
      delete: "Удалить",
      required: "Выберите сотрудника, сумму и причину",
      created: "Штраф сохранён",
      saved: "Штраф обновлён",
      deleted: "Штраф удалён",
      status: {
        active: "Активный",
        cancelled: "Отменён",
      },
    };
  }

  return {
    title: "Xodim jarimalari",
    subtitle: "Ish haqi hisobida avtomatik ushlanadigan jarimalar",
    add: "Yangi jarima",
    addTitle: "Yangi jarima",
    addDescription: "Xodim, summa, sana va ushlab qolish sababini kiriting.",
    search: "Xodim, telefon, sabab yoki izoh bo'yicha qidirish...",
    allStatuses: "Barcha statuslar",
    allBranches: "Barcha filiallar",
    allMonths: "Barcha oylar",
    kpiAmount: "Faol jarimalar",
    kpiActive: "Faol yozuvlar",
    kpiMonth: "Davr",
    kpiRecords: "Yozuvlar",
    staff: "Xodim",
    branch: "Filial",
    reason: "Sabab",
    date: "Sana",
    statusLabel: "Status",
    amount: "Summa",
    comment: "Izoh",
    detail: "Jarima",
    empty: "Jarimalar topilmadi",
    selectStaff: "Xodim tanlang",
    notSelected: "Tanlanmagan",
    reasonPlaceholder: "Masalan: kechikish, tartib buzilishi",
    commentPlaceholder: "Direktor yoki buxgalter uchun qo'shimcha ma'lumot",
    cancel: "Bekor qilish",
    create: "Jarimani saqlash",
    save: "Saqlash",
    delete: "O'chirish",
    required: "Xodim, summa va sababni kiriting",
    created: "Jarima saqlandi",
    saved: "Jarima yangilandi",
    deleted: "Jarima o'chirildi",
    status: {
      active: "Faol",
      cancelled: "Bekor qilingan",
    },
  };
}
