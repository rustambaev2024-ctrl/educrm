import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Building2, Users, Activity, AlertTriangle, Search, Plus, Pencil, Trash2, MapPin, DoorOpen } from "lucide-react";
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { superadminApi, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney, getLocalDateString } from "@/lib/format";
import type { Institution, InstitutionStatus, Branch } from "@/lib/data/types";

export const Route = createFileRoute("/superadmin/")({ component: SuperadminHome });

const STATUS_TONE: Record<InstitutionStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  frozen: "bg-warning/15 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground border-border",
};

interface InstitutionFormState {
  name: string;
  slug: string;
  city: string;
  domain: string;
  status: InstitutionStatus;
  expiresAt: string;
  directorName: string;
  directorPhone: string;
  directorPassword: string;
}

const CREATION_STEPS = [
  { id: "schema", label: "Sxema yaratilmoqda..." },
  { id: "migrate", label: "Bazalar sozlanmoqda..." },
  { id: "director", label: "Direktor yaratilmoqda..." },
  { id: "branch", label: "Filial yaratilmoqda..." },
];

const emptyForm: InstitutionFormState = {
  name: "", slug: "", city: "", domain: "", status: "active",
  expiresAt: getLocalDateString(new Date(Date.now() + 365 * 86400000)),
  directorName: "", directorPhone: "", directorPassword: "",
};

function makeSchemaSlug(value: string) {
  const cyrillicMap: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
    қ: "q", ғ: "g", ҳ: "h", ў: "u",
  };
  const transliterated = value
    .toLowerCase()
    .split("")
    .map((char) => cyrillicMap[char] ?? char)
    .join("");
  const slug = transliterated
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "institution";
}

function SuperadminHome() {
  const { t, lang } = useI18n();
  const { institutions, branches, addInstitution, updateInstitution, deleteInstitution, addBranch, deleteBranch, isLoading } = useData();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<"all" | InstitutionStatus>("all");

  const [openInst, setOpenInst] = useState(false);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [form, setForm] = useState<InstitutionFormState>(emptyForm);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [creationStep, setCreationStep] = useState<number>(-1);

  // Проверка доступности slug (debounce 500ms) — только при создании
  useEffect(() => {
    if (editing || !openInst || !form.slug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const r = await superadminApi.institutions.checkSlug(form.slug);
        setSlugStatus(r.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.slug, editing, openInst]);

  const [branchInst, setBranchInst] = useState<Institution | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "" });
  const [deleteTarget, setDeleteTarget] = useState<Institution | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<{ inst: Institution; activeCount: number } | null>(null);
  const activeBranchInst = useMemo(() => {
    if (!branchInst) return null;
    return (
      institutions.find((i) => i.id === branchInst.id) ??
      institutions.find((i) => i.slug && i.slug === branchInst.slug) ??
      institutions.find((i) => i.schemaName && i.schemaName === branchInst.schemaName) ??
      branchInst
    );
  }, [branchInst, institutions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutions.filter((i) => {
      if (statusF !== "all" && i.status !== statusF) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.city.toLowerCase().includes(q);
    });
  }, [institutions, search, statusF]);

  const totals = useMemo(() => {
    const active = institutions.filter((i) => i.status === "active");
    const frozen = institutions.filter((i) => i.status === "frozen").length;
    const expiringSoon = institutions.filter((i) => {
      const days = (new Date(i.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30 && i.status === "active";
    }).length;
    return { active: active.length, frozen, expiringSoon };
  }, [institutions]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenInst(true);
  };

  const openEdit = (i: Institution) => {
    setEditing(i);
    setForm({
      name: i.name, slug: i.slug ?? i.schemaName ?? "", city: i.city, domain: i.domain ?? "", status: i.status, expiresAt: i.expiresAt,
      directorName: i.directorName ?? "", directorPhone: i.directorPhone ?? "", directorPassword: "",
    });
    setOpenInst(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.city.trim()) {
      toast.error(t("common.required"));
      return;
    }
    const schemaSlug = editing
      ? makeSchemaSlug(form.slug || form.name)
      : makeSchemaSlug(form.name);
    const domain = editing
      ? form.domain.trim() || `${schemaSlug}.localhost`
      : `${schemaSlug}.localhost`;
    if (!editing && (!form.directorName.trim() || !form.directorPhone.trim() || !form.directorPassword.trim())) {
      toast.error(t("common.required"));
      return;
    }
    if (editing) {
      updateInstitution(editing.id, {
        name: form.name.trim(), slug: schemaSlug, domain, city: form.city.trim(), status: form.status,
        expiresAt: form.expiresAt,
        directorName: form.directorName.trim() || undefined,
        directorPhone: form.directorPhone.trim() || undefined,
        directorPassword: form.directorPassword.trim() || undefined,
      });
      toast.success(t("sa.updated"));
      setOpenInst(false);
      return;
    }
    if (slugStatus === "taken") {
      toast.error(lang === "uz" ? "Bu slug band — boshqa nom tanlang" : "Этот slug занят — выберите другое название");
      return;
    }
    // Прогресс: реального статуса с бэка нет, шаги имитируются таймером,
    // но завершение/ошибка — по реальному ответу API.
    setCreationStep(0);
    const timer = setInterval(() => {
      setCreationStep((prev) => Math.min(prev + 1, CREATION_STEPS.length - 1));
    }, 2000);
    const ok = await addInstitution({
      name: form.name.trim(), slug: schemaSlug, domain, city: form.city.trim(), status: form.status,
      expiresAt: form.expiresAt,
      directorName: form.directorName.trim() || undefined,
      directorPhone: form.directorPhone.trim() || undefined,
      directorPassword: form.directorPassword.trim() || undefined,
    });
    clearInterval(timer);
    setCreationStep(-1);
    if (ok) {
      toast.success(t("sa.created"));
      setOpenInst(false);
    }
    // Ошибку с деталями показывает store через apiErrorMessage
  };

  const handleDelete = async (i: Institution, force = false) => {
    setDeleting(true);
    try {
      if (force) {
        await superadminApi.institutions.deleteForce(i.id);
      } else {
        await superadminApi.institutions.delete(i.id);
      }
      deleteInstitution(i.id);
      toast.success(t("sa.deleted"));
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setForceDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const activeCount = (err.body as { active_students_count?: number }).active_students_count ?? 0;
        setForceDeleteTarget({ inst: i, activeCount });
        setDeleteTarget(null);
        setDeleteConfirmText("");
      } else {
        toast.error(lang === "uz" ? "O'chirishda xatolik" : "Ошибка при удалении");
      }
    } finally {
      setDeleting(false);
    }
  };

  const submitBranch = () => {
    if (!activeBranchInst) return;
    if (String(activeBranchInst.id).startsWith("i_")) {
      toast.warning("Muassasa hali saqlanmoqda. Bir necha soniyadan keyin qayta urinib ko'ring.");
      return;
    }
    if (!branchForm.name.trim() || !branchForm.address.trim()) {
      toast.error(t("common.required"));
      return;
    }
    addBranch({
      name: branchForm.name.trim(),
      address: branchForm.address.trim(),
      institutionId: activeBranchInst.id,
    });
    toast.success(t("sa.branches.added"));
    setBranchForm({ name: "", address: "" });
  };

  const branchesOf = (id: string) => branches.filter((b) => b.institutionId === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={t("sa.institutions.title")}
      subtitle={t("sa.institutions.subtitle")}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={openCreate}>
          <Plus className="size-3.5" /> {t("sa.add")}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={lang === "uz" ? "Jami tashkilotlar" : "Всего организаций"} value={institutions.length} icon={Building2} iconColor="blue" />
          <KpiCard label={lang === "uz" ? "Faol" : "Активные"} value={totals.active} icon={Activity} iconColor="green" />
          <KpiCard label={lang === "uz" ? "Muzlatilgan" : "Замороженные"} value={totals.frozen} icon={Users} iconColor="violet" />
          <KpiCard label={lang === "uz" ? "Muddati tugaydi" : "Истекает срок"} value={totals.expiringSoon} icon={AlertTriangle} iconColor="amber" />
        </div>

        <Card className="overflow-hidden p-0 shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="pl-9" />
            </div>
            <Select value={statusF} onValueChange={(v) => setStatusF(v as typeof statusF)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="active">{t("sa.istatus.active")}</SelectItem>
                <SelectItem value="frozen">{t("sa.istatus.frozen")}</SelectItem>
                <SelectItem value="archived">{t("sa.istatus.archived")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} / {institutions.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("sa.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sa.col.name")}</TableHead>
                  <TableHead>{t("sa.col.city")}</TableHead>
                  <TableHead>{t("sa.col.director")}</TableHead>
                  <TableHead className="text-right">{t("sa.col.students")}</TableHead>
                  <TableHead className="text-right">{t("sa.col.branches")}</TableHead>
                  <TableHead>{t("sa.col.status")}</TableHead>
                  <TableHead className="text-right">{t("sa.col.revenue")}</TableHead>
                  <TableHead>{t("sa.col.expires")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id} className="hover:bg-accent/30">
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.city}</TableCell>
                    <TableCell className="text-sm">
                      {i.directorName ? (
                        <div>
                          <div className="font-medium leading-tight">{i.directorName}</div>
                          {i.directorPhone && <div className="text-[11px] text-muted-foreground">{i.directorPhone}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.studentsCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.branchesCount}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_TONE[i.status]}>{t(`sa.istatus.${i.status}`)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(i.monthlyRevenue, lang)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{formatDate(i.expiresAt, lang)}</span>
                        {i.subscriptionStatus === "expired" && (
                          <Badge variant="outline" className="w-fit bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                            {lang === "uz" ? "Muddati o'tgan" : "Истёк"}
                          </Badge>
                        )}
                        {i.subscriptionStatus === "expiring_soon" && (
                          <Badge variant="outline" className="w-fit bg-warning/10 text-warning border-warning/30 text-[10px]">
                            {lang === "uz" ? "Tez orada tugaydi" : "Истекает скоро"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setBranchInst(i); setBranchForm({ name: "", address: "" }); }} title={t("sa.viewBranches")}>
                          <MapPin className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(i)} title={t("sa.edit")}>
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive" title={t("sa.delete")} onClick={() => { setDeleteTarget(i); setDeleteConfirmText(""); }}>
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("sa.delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("common.confirmDelete")} — <strong>{i.name}</strong>
                                <br /><br />
                                <span className="text-xs">Tasdiqlash uchun &quot;{i.name}&quot; deb yozing:</span>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <Input
                              placeholder={`"${i.name}" deb yozing`}
                              value={deleteTarget?.id === i.id ? deleteConfirmText : ""}
                              onChange={(e) => { setDeleteTarget(i); setDeleteConfirmText(e.target.value); }}
                            />
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(i)}
                                disabled={deleteConfirmText !== i.name || deleting}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                              >
                                {deleting ? "..." : t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Institution create/edit dialog */}
      <Dialog open={openInst} onOpenChange={(o) => { if (creationStep >= 0) return; setOpenInst(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("sa.edit") : t("sa.add")}</DialogTitle>
            <DialogDescription>{t("sa.institutions.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("sa.field.name")}>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  const generatedSlug = makeSchemaSlug(name);
                  setForm((prev) => ({
                    ...prev,
                    name,
                    slug: editing ? prev.slug : generatedSlug,
                    domain: editing ? prev.domain : `${generatedSlug}.localhost`,
                  }));
                }}
              />
              {!editing && form.slug && (
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{form.slug}</span>
                  {slugStatus === "checking" && <span className="text-muted-foreground">{lang === "uz" ? "Tekshirilmoqda..." : "Проверяется..."}</span>}
                  {slugStatus === "available" && <span className="text-success">✓ {lang === "uz" ? "Mavjud" : "Свободен"}</span>}
                  {slugStatus === "taken" && <span className="text-destructive">✗ {lang === "uz" ? "Band" : "Занят"}</span>}
                </div>
              )}
            </Field>
            <Field label={t("sa.field.city")}>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label={t("sa.field.status")}>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as InstitutionStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("sa.istatus.active")}</SelectItem>
                  <SelectItem value="frozen">{t("sa.istatus.frozen")}</SelectItem>
                  <SelectItem value="archived">{t("sa.istatus.archived")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("sa.field.expires")} className="md:col-span-2">
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </Field>
            <div className="md:col-span-2 mt-2 rounded-xl border border-border/60 bg-accent/30 p-4">
              <div className="mb-1 text-sm font-semibold">{t("sa.directorBlock")}</div>
              <div className="mb-3 text-xs text-muted-foreground">{t("sa.directorHint")}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("sa.field.directorName")}>
                  <Input value={form.directorName} onChange={(e) => setForm({ ...form, directorName: e.target.value })} placeholder={t("common.optional")} />
                </Field>
                <Field label={t("sa.field.directorPhone")}>
                  <PhoneInput value={form.directorPhone} onChange={(e) => setForm({ ...form, directorPhone: e.target.value })} />
                </Field>
                {!editing && (
                  <Field label="Director password">
                    <PasswordInput
                      value={form.directorPassword}
                      onChange={(e) => setForm({ ...form, directorPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>
          {creationStep >= 0 && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-accent/30 p-4">
              {CREATION_STEPS.map((step, i) => (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors",
                    i < creationStep ? "text-success" : i === creationStep ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  <span className="w-4 text-center">{i < creationStep ? "✓" : i === creationStep ? "⏳" : "○"}</span>
                  {step.label}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenInst(false)} disabled={creationStep >= 0}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={creationStep >= 0 || (!editing && slugStatus === "taken")}>
              {creationStep >= 0 ? "..." : editing ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branches manager */}
      <Dialog open={!!activeBranchInst} onOpenChange={(o) => !o && setBranchInst(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("sa.branches.title")}</DialogTitle>
            <DialogDescription>{activeBranchInst?.name}</DialogDescription>
          </DialogHeader>
          {activeBranchInst && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("sa.branches.add")}</div>
                <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <Input placeholder={t("branches.field.name")} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
                  <Input placeholder={t("branches.field.address")} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
                  <Button onClick={submitBranch} className="gap-2"><Plus className="size-4" /> {t("common.add")}</Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60">
                {branchesOf(activeBranchInst.id).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">{t("sa.branches.empty")}</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {branchesOf(activeBranchInst.id).map((b: Branch) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                            <DoorOpen className="size-4" />
                          </div>
                          <div>
                            <div className="font-medium leading-tight">{b.name}</div>
                            <div className="text-xs text-muted-foreground">{b.address}</div>
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive">
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("common.confirmDelete")} — {b.name}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => { deleteBranch(b.id); toast.success(t("sa.branches.deleted")); }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchInst(null)}>{t("common.back")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force-delete confirmation when active students exist */}
      <AlertDialog open={!!forceDeleteTarget} onOpenChange={(o) => !o && setForceDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === "uz" ? "Faol o'quvchilar bor!" : "Есть активные студенты!"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "uz"
                ? `"${forceDeleteTarget?.inst.name}" tashkilotida ${forceDeleteTarget?.activeCount} faol o'quvchi bor. Barchasini o'chirib yuborasizmi? Bu amalni qaytarib bo'lmaydi.`
                : `В организации "${forceDeleteTarget?.inst.name}" есть ${forceDeleteTarget?.activeCount} активных студентов. Удалить всё равно? Это действие необратимо.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setForceDeleteTarget(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => forceDeleteTarget && handleDelete(forceDeleteTarget.inst, true)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "..." : lang === "uz" ? "Ha, o'chirib yuborish" : "Да, удалить всё"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
