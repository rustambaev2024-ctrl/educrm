import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Users, Activity, AlertTriangle, Search, Plus, Pencil, Trash2, MapPin, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { StatCard } from "@/components/edu/stat-card";
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
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { Institution, InstitutionPlan, InstitutionStatus, Branch } from "@/lib/data/types";

export const Route = createFileRoute("/superadmin/")({ component: SuperadminHome });

const STATUS_TONE: Record<InstitutionStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  frozen: "bg-warning/15 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const PLAN_TONE: Record<InstitutionPlan, string> = {
  basic: "border-border bg-secondary text-foreground",
  standard: "border-info/30 bg-info/10 text-info",
  pro: "border-primary/30 bg-accent text-primary",
};

interface InstitutionFormState {
  name: string;
  slug: string;
  city: string;
  domain: string;
  plan: InstitutionPlan;
  status: InstitutionStatus;
  expiresAt: string;
  directorName: string;
  directorPhone: string;
  directorPassword: string;
}

const emptyForm: InstitutionFormState = {
  name: "", slug: "", city: "", domain: "", plan: "standard", status: "active",
  expiresAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
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
  const { institutions, branches, addInstitution, updateInstitution, deleteInstitution, addBranch, deleteBranch } = useData();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<"all" | InstitutionStatus>("all");
  const [planF, setPlanF] = useState<"all" | InstitutionPlan>("all");

  const [openInst, setOpenInst] = useState(false);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [form, setForm] = useState<InstitutionFormState>(emptyForm);

  const [branchInst, setBranchInst] = useState<Institution | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "" });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutions.filter((i) => {
      if (statusF !== "all" && i.status !== statusF) return false;
      if (planF !== "all" && i.plan !== planF) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.city.toLowerCase().includes(q);
    });
  }, [institutions, search, statusF, planF]);

  const totals = useMemo(() => {
    const active = institutions.filter((i) => i.status === "active");
    const totalStudents = active.reduce((s, i) => s + i.studentsCount, 0);
    const mrr = active.reduce((s, i) => s + i.monthlyRevenue, 0);
    const expiringSoon = institutions.filter((i) => {
      const days = (new Date(i.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30 && i.status === "active";
    }).length;
    return { active: active.length, totalStudents, mrr, expiringSoon };
  }, [institutions]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenInst(true);
  };

  const openEdit = (i: Institution) => {
    setEditing(i);
    setForm({
      name: i.name, slug: i.slug ?? i.schemaName ?? "", city: i.city, domain: i.domain ?? "", plan: i.plan, status: i.status, expiresAt: i.expiresAt,
      directorName: i.directorName ?? "", directorPhone: i.directorPhone ?? "", directorPassword: "",
    });
    setOpenInst(true);
  };

  const handleSubmit = () => {
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
        name: form.name.trim(), slug: schemaSlug, domain, city: form.city.trim(), plan: form.plan, status: form.status,
        expiresAt: form.expiresAt,
        directorName: form.directorName.trim() || undefined,
        directorPhone: form.directorPhone.trim() || undefined,
        directorPassword: form.directorPassword.trim() || undefined,
      });
      toast.success(t("sa.updated"));
    } else {
      addInstitution({
        name: form.name.trim(), slug: schemaSlug, domain, city: form.city.trim(), plan: form.plan, status: form.status,
        expiresAt: form.expiresAt,
        directorName: form.directorName.trim() || undefined,
        directorPhone: form.directorPhone.trim() || undefined,
        directorPassword: form.directorPassword.trim() || undefined,
      });
      toast.success(t("sa.created"));
    }
    setOpenInst(false);
  };

  const handleDelete = (i: Institution) => {
    deleteInstitution(i.id);
    toast.success(t("sa.deleted"));
  };

  const submitBranch = () => {
    if (!branchInst) return;
    if (!branchForm.name.trim() || !branchForm.address.trim()) {
      toast.error(t("common.required"));
      return;
    }
    addBranch({
      name: branchForm.name.trim(),
      address: branchForm.address.trim(),
      institutionId: branchInst.id,
    });
    toast.success(t("sa.branches.added"));
    setBranchForm({ name: "", address: "" });
  };

  const branchesOf = (id: string) => branches.filter((b) => b.institutionId === id);

  return (
    <>
      <PageHeader
        title={t("sa.institutions.title")}
        description={t("sa.institutions.subtitle")}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> {t("sa.add")}
          </Button>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t("sa.kpi.totalInst")} value={`${institutions.length}`} icon={Building2} tone="primary" />
          <StatCard label={t("sa.kpi.totalStudents")} value={totals.totalStudents.toLocaleString("ru-RU")} icon={Users} tone="success" />
          <StatCard label={t("sa.kpi.mrr")} value={formatMoney(totals.mrr, lang)} icon={Activity} tone="info" />
          <StatCard label={t("sa.kpi.expiring")} value={`${totals.expiringSoon}`} icon={AlertTriangle} tone="warning" />
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
            <Select value={planF} onValueChange={(v) => setPlanF(v as typeof planF)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="basic">{t("sa.plan.basic")}</SelectItem>
                <SelectItem value="standard">{t("sa.plan.standard")}</SelectItem>
                <SelectItem value="pro">{t("sa.plan.pro")}</SelectItem>
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
                  <TableHead>{t("sa.col.plan")}</TableHead>
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
                    <TableCell><Badge variant="outline" className={PLAN_TONE[i.plan]}>{t(`sa.plan.${i.plan}`)}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_TONE[i.status]}>{t(`sa.istatus.${i.status}`)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(i.monthlyRevenue, lang)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(i.expiresAt, lang)}</TableCell>
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
                            <Button size="icon" variant="ghost" className="text-destructive" title={t("sa.delete")}>
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("sa.delete")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("common.confirmDelete")} — {i.name}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(i)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {t("common.delete")}
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
      <Dialog open={openInst} onOpenChange={setOpenInst}>
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
            </Field>
            <Field label={t("sa.field.city")}>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label={t("sa.field.plan")}>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as InstitutionPlan })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">{t("sa.plan.basic")}</SelectItem>
                  <SelectItem value="standard">{t("sa.plan.standard")}</SelectItem>
                  <SelectItem value="pro">{t("sa.plan.pro")}</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="md:col-span-2 mt-2 rounded-lg border border-border/60 bg-accent/30 p-4">
              <div className="mb-1 text-sm font-semibold">{t("sa.directorBlock")}</div>
              <div className="mb-3 text-xs text-muted-foreground">{t("sa.directorHint")}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("sa.field.directorName")}>
                  <Input value={form.directorName} onChange={(e) => setForm({ ...form, directorName: e.target.value })} placeholder={t("common.optional")} />
                </Field>
                <Field label={t("sa.field.directorPhone")}>
                  <Input value={form.directorPhone} onChange={(e) => setForm({ ...form, directorPhone: e.target.value })} placeholder="+998 ..." />
                </Field>
                {!editing && (
                  <Field label="Director password">
                    <Input
                      type="password"
                      value={form.directorPassword}
                      onChange={(e) => setForm({ ...form, directorPassword: e.target.value })}
                      placeholder="min. 8 characters"
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenInst(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit}>{editing ? t("common.save") : t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branches manager */}
      <Dialog open={!!branchInst} onOpenChange={(o) => !o && setBranchInst(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("sa.branches.title")}</DialogTitle>
            <DialogDescription>{branchInst?.name}</DialogDescription>
          </DialogHeader>
          {branchInst && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("sa.branches.add")}</div>
                <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <Input placeholder={t("branches.field.name")} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
                  <Input placeholder={t("branches.field.address")} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
                  <Button onClick={submitBranch} className="gap-2"><Plus className="size-4" /> {t("common.add")}</Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/60">
                {branchesOf(branchInst.id).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">{t("sa.branches.empty")}</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {branchesOf(branchInst.id).map((b: Branch) => (
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
    </>
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
