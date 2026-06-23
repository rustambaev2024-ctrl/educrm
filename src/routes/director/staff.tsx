import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Phone, Briefcase, Plus, Pencil, Trash2, GraduationCap, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import type { Staff } from "@/lib/data/types";
import { SupportTeacherLinks } from "@/components/edu/support-teacher-links";

export const Route = createFileRoute("/director/staff")({ component: StaffPage });

const ROLE_TONE: Record<string, string> = {
  director: "bg-primary/15 text-primary border-primary/30",
  admin: "bg-info/15 text-info border-info/30",
  teacher: "bg-success/15 text-success border-success/30",
  support_teacher: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

type StaffRole = Staff["role"];

interface FormState {
  fullName: string;
  phone: string;
  password: string;
  role: StaffRole;
  branchId: string;
  salaryPercent: string;
  fixedSalary: string;
}

const empty: FormState = { fullName: "", phone: "", password: "", role: "teacher", branchId: "", salaryPercent: "40", fixedSalary: "2000000" };

function StaffPage() {
  const { t, lang } = useI18n();
  const { staff, branches, groups, payments, addStaff, updateStaff, deleteStaff, isLoading } = useData();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "teachers" | "admins">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b])), [branches]);

  const enriched = useMemo(() => {
    return staff.map((s) => {
      const sGroups = groups.filter((g) => g.teacherId === s.id);
      const studentSet = new Set<string>();
      sGroups.forEach((g) => g.studentIds.forEach((sid) => studentSet.add(sid)));
      const lastSalary = payments
        .filter((p) => p.staffId === s.id && p.direction === "out" && p.category === "salary")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        ...s,
        groupsCount: sGroups.length,
        studentsCount: studentSet.size,
        lastSalary: lastSalary?.amount ?? 0,
      };
    });
  }, [staff, groups, payments]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (tab === "teachers") list = list.filter((s) => s.role === "teacher");
    if (tab === "admins") list = list.filter((s) => s.role === "admin" || s.role === "director");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.fullName.toLowerCase().includes(q) || s.phone.includes(q));
    return list;
  }, [enriched, tab, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, branchId: branches[0]?.id ?? "" });
    setOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({
      fullName: s.fullName,
      phone: s.phone,
      password: "",
      role: s.role,
      branchId: s.branchId ?? "",
      salaryPercent: String(s.salaryPercent ?? 40),
      fixedSalary: String(s.fixedSalary ?? 2000000),
    });
    setOpen(true);
  };

  const submit = async () => {
    if (isSubmitting) return;
    if (!form.fullName.trim() || !form.phone.trim() || (!editing && !form.password.trim())) {
      toast.error(t("common.required"));
      return;
    }
    const normalizedPhone = form.phone.replace(/[^\d+]/g, "");
    const phoneAlreadyUsed = staff.some((s) => s.id !== editing?.id && s.phone.replace(/[^\d+]/g, "") === normalizedPhone);
    if (phoneAlreadyUsed) {
      toast.error("Bu telefon raqam allaqachon xodimga biriktirilgan");
      return;
    }
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      password: form.password.trim() || undefined,
      role: form.role,
      branchId: form.role === "director" ? undefined : form.branchId || undefined,
      salaryPercent: form.role === "teacher" ? Number(form.salaryPercent) || 40 : undefined,
      fixedSalary: form.role !== "teacher" ? (Number(form.fixedSalary) || undefined) : undefined,
    };
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateStaff(editing.id, payload);
        toast.success(t("staff.updated"));
      } else {
        await addStaff(payload);
        toast.success(t("staff.created"));
      }
      setOpen(false);
    } catch {
      toast.error(t("common.error") ?? "Xatolik yuz berdi");
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async (s: Staff) => {
    if (isDeletingId) return;
    setIsDeletingId(s.id);
    try {
      await deleteStaff(s.id);
      toast.success(t("staff.deleted"));
    } catch {
      toast.error(t("common.error") ?? "Xatolik yuz berdi");
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={t("staff.title")}
      subtitle={t("staff.subtitle")}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={openCreate}>
          <Plus className="size-3.5" /> {t("staff.add")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label={t("staff.title")} value={staff.length} icon={Briefcase} iconColor="blue" />
          <KpiCard label={lang === "uz" ? "O'qituvchilar" : "Учителя"} value={staff.filter((s) => s.role === "teacher").length} icon={GraduationCap} iconColor="green" />
          <KpiCard label={lang === "uz" ? "Adminlar" : "Админы"} value={staff.filter((s) => s.role === "admin" || s.role === "director").length} icon={UserCog} iconColor="violet" />
        </div>
        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="pl-9" autoComplete="off" />
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="all">{t("staff.tab.all")}</TabsTrigger>
                <TabsTrigger value="teachers">{t("staff.tab.teachers")}</TabsTrigger>
                <TabsTrigger value="admins">{t("staff.tab.admins")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("staff.empty")}</div>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("staff.col.name")}</TableHead>
                  <TableHead>{t("staff.col.role")}</TableHead>
                  <TableHead>{t("staff.col.phone")}</TableHead>
                  <TableHead>{t("staff.col.branch")}</TableHead>
                  <TableHead className="text-right">{t("staff.col.groups")}</TableHead>
                  <TableHead className="text-right">{t("staff.col.students")}</TableHead>
                  <TableHead className="text-right">{t("staff.col.salary")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                          {s.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                        </div>
                        <div>
                          <div className="font-medium leading-tight">{s.fullName}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_TONE[s.role] ?? ""}>{t(`role.${s.role}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {s.phone}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.branchId ? branchById[s.branchId]?.name : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.role === "teacher" ? s.groupsCount : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.role === "teacher" ? s.studentsCount : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {s.role === "teacher"
                        ? `${s.salaryPercent ?? 40}%`
                        : s.fixedSalary
                          ? formatMoney(s.fixedSalary, lang)
                          : s.lastSalary > 0 ? formatMoney(s.lastSalary, lang) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)} title={t("staff.edit")}>
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive" title={t("staff.delete")}>
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("staff.delete")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("common.confirmDelete")} — {s.fullName}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(s)} disabled={isDeletingId === s.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {isDeletingId === s.id ? "..." : t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
        </Card>

        <SupportTeacherLinks />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("staff.edit") : t("staff.add")}</DialogTitle>
            <DialogDescription>{t("staff.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t("staff.field.name")}>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t("staff.field.phone")}>
              <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Password">
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("staff.field.role")}>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="director">{t("role.director")}</SelectItem>
                    <SelectItem value="admin">{t("role.admin")}</SelectItem>
                    <SelectItem value="teacher">{t("role.teacher")}</SelectItem>
                    <SelectItem value="support_teacher">{lang === "uz" ? "Yordamchi o'qituvchi" : "Помощник учителя"}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("staff.field.branch")}>
                <Select
                  value={form.branchId}
                  onValueChange={(v) => setForm({ ...form, branchId: v })}
                  disabled={form.role === "director"}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {form.role === "teacher" ? (
              <Field label={lang === "uz" ? "O'qituvchi foizi (%)" : "Процент учителя (%)"} >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={form.salaryPercent}
                  onChange={(e) => setForm({ ...form, salaryPercent: e.target.value })}
                  placeholder="40"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {lang === "uz" ? "Kurs oylik narxidan foiz" : "Процент от месячной стоимости курса"}
                </p>
              </Field>
            ) : form.role !== "director" ? (
              <Field label={lang === "uz" ? "Belgilangan oylik (UZS)" : "Фиксированная зарплата (UZS)"}>
                <Input
                  type="number"
                  min={0}
                  step={100000}
                  value={form.fixedSalary}
                  onChange={(e) => setForm({ ...form, fixedSalary: e.target.value })}
                  placeholder="2000000"
                  autoComplete="off"
                />
              </Field>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={isSubmitting}>{isSubmitting ? "..." : (editing ? t("common.save") : t("common.create"))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
