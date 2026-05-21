import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Phone, Calendar as CalendarIcon, X, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDate, formatMoney } from "@/lib/format";
import type { Student, StudentStatus } from "@/lib/data/types";
import { transferApi, paymentApi } from "@/lib/api";
import { mapPayments } from "@/lib/data/mappers";
import { Textarea } from "@/components/ui/textarea";

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

export function StudentsPage() {
  const { t, lang } = useI18n();
  const { students, groups, addStudent, archiveStudent, deleteStudent } = useData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [students, search, statusFilter]);

  const selected = useMemo(() => students.find((s) => s.id === selectedId) ?? null, [students, selectedId]);

  return (
    <>
      <PageHeader
        title={t("students.title")}
        description={t("students.subtitle")}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="bg-gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="mr-1 size-4" /> {t("students.add")}
          </Button>
        }
      />
      <div className="p-4 md:p-8">
        <Card className="overflow-hidden shadow-elegant">
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
              <span className="text-xs text-muted-foreground">{filtered.length} {t("students.count")}</span>
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
            <div className="p-12 text-center text-sm text-muted-foreground">{t("students.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("students.col.name")}</TableHead>
                  <TableHead>{t("students.col.phone")}</TableHead>
                  <TableHead>{t("students.col.status")}</TableHead>
                  <TableHead>{t("students.col.groups")}</TableHead>
                  <TableHead className="text-right">{t("students.col.balance")}</TableHead>
                  <TableHead>{t("students.col.registered")}</TableHead>
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
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setSelectedId(s.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                            {s.photo ? (
                              <img src={s.photo} alt={s.fullName} className="size-full object-cover" />
                            ) : (
                              s.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")
                            )}
                          </div>
                          <div>
                            <div className="font-medium leading-tight">{s.fullName}</div>
                            <div className="text-[11px] text-muted-foreground">ID: {s.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.phone}</TableCell>
                      <TableCell><StudentStatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-sm">
                        {groupNames.length === 0 ? (
                          <span className="text-muted-foreground">{t("students.noGroups")}</span>
                        ) : (
                          <div className="flex flex-col">
                            {groupNames.map((n, i) => (
                              <span key={i} className="truncate max-w-[200px]">{n}</span>
                            ))}
                            {s.groupIds.length > 2 && (
                              <span className="text-[11px] text-muted-foreground">+{s.groupIds.length - 2}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${s.balance < 0 ? "text-destructive" : ""}`}>
                        {formatMoney(s.balance, lang)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(s.registeredAt, lang)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
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
    </>
  );
}

export function CreateStudentSheet({
  open,
  onOpenChange,
  onCreate,
  initialData,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (payload: {
    fullName: string;
    phone: string;
    password?: string;
    birthDate?: string;
    branchId: string;
    parentName?: string;
    parentPhone?: string;
    parentPassword?: string;
  }) => void;
  initialData?: {
    fullName?: string;
    phone?: string;
    branchId?: string;
  };
}) {
  const { t } = useI18n();
  const { branches } = useData();
  // Combines current timestamp (last 3 digits = milliseconds) + 3 random digits.
  // This gives ~1 in 1,000,000,000 chance of collision — practically unique.
  const genPin = () => {
    const timePart = String(Date.now()).slice(-3);
    const randPart = String(Math.floor(100 + Math.random() * 900));
    return timePart + randPart;
  };
  const [fullName, setFullName] = useState(initialData?.fullName ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [password, setPassword] = useState(genPin);
  const [birthDate, setBirthDate] = useState("");

  const [branchId, setBranchId] = useState(initialData?.branchId ?? branches[0]?.id ?? "");
  const [hasParent, setHasParent] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentPassword, setParentPassword] = useState(genPin);

  const reset = () => {
    setFullName(initialData?.fullName ?? "");
    setPhone(initialData?.phone ?? "");
    setPassword(genPin());
    setBirthDate("");
    setHasParent(false);
    setParentName("");
    setParentPhone("");
    setParentPassword(genPin());
    setBranchId(initialData?.branchId ?? branches[0]?.id ?? "");
  };

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, initialData]);

  const submit = () => {
    if (!fullName.trim() || !phone.trim() || !branchId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    if (hasParent && (!parentName.trim() || !parentPhone.trim())) {
      toast.error(t("validation.fillAll"));
      return;
    }
    onCreate({
      fullName: fullName.trim(),
      phone: phone.trim(),
      password: password.trim() || undefined,
      birthDate: birthDate || undefined,
      branchId,
      parentName: hasParent ? parentName.trim() || undefined : undefined,
      parentPhone: hasParent ? parentPhone.trim() || undefined : undefined,
      parentPassword: hasParent ? parentPassword.trim() || undefined : undefined,
    });
    reset();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("students.add")}</SheetTitle>
          <SheetDescription>Yangi o'quvchi va uning hujjatlarini tizimga kiritish</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-1 py-6">
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("students.field.fullName")} *</Label>
                <Input id="fullName" placeholder="F.I.SH." value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t("students.field.birthDate")}</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{t("students.field.phone")} *</Label>
                <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">O'quvchi paroli</Label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-[11px] text-muted-foreground">Avtomatik 6 xonali parol yaratildi. Xohlasangiz o'zgartiring.</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t("nav.branches")} *</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            

          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{t("students.section.parent")}</div>
                <p className="text-[11px] text-muted-foreground">Kichik yoshdagi o'quvchilar uchun to'ldiring</p>
              </div>
              <Switch checked={hasParent} onCheckedChange={setHasParent} />
            </div>
            
            {hasParent && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label htmlFor="parentName">Ota-onaning F.I.SH. *</Label>
                  <Input id="parentName" placeholder="F.I.SH." value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="parentPhone">Ota-onaning telefon raqami *</Label>
                    <PhoneInput id="parentPhone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentPassword">Ota-ona paroli</Label>
                    <PasswordInput id="parentPassword" value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} autoComplete="new-password" />
                    <p className="text-[11px] text-muted-foreground">Avtomatik 6 xonali parol yaratildi.</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
        <SheetFooter className="px-1 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} className="bg-gradient-primary text-primary-foreground">O'quvchini qo'shish</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StudentDetailSheet({
  student,
  onClose,
  onArchive,
  onDelete,
}: {
  student: Student | null;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string, deleteParent: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const { groups, parents, payments, updateStudentPasswords, assignParent, reload } = useData();
  const open = student !== null;
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [newParentPassword, setNewParentPassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteParentToo, setDeleteParentToo] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromGroupId: "",
    toGroupId: "",
    transferDate: new Date().toISOString().split("T")[0],
    reason: "other",
    comment: "",
  });
  const [transfers, setTransfers] = useState<any[]>([]);
  const [studentPayments, setStudentPayments] = useState<any[]>([]);

  useEffect(() => {
    if (student) {
      transferApi.history({ student_id: student.id })
        .then((data) => setTransfers(Array.isArray(data) ? data : []))
        .catch((e) => console.error("Failed to load transfers", e));

      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => console.error("Failed to load student payments", e));
    }
  }, [student]);

  const genPin = () => {
    const timePart = String(Date.now()).slice(-3);
    const randPart = String(Math.floor(100 + Math.random() * 900));
    return timePart + randPart;
  };

  const [assignParentOpen, setAssignParentOpen] = useState(false);
  const [assignType, setAssignType] = useState<"existing" | "new">("existing");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [newParentPhone, setNewParentPhone] = useState("");
  const [assignParentPassword, setAssignParentPassword] = useState(genPin());
  const [parentSearch, setParentSearch] = useState("");

  const filteredParents = useMemo(() => {
    const q = parentSearch.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q)
    );
  }, [parents, parentSearch]);

  const handleAssignParent = async () => {
    if (!student) return;
    try {
      if (assignType === "existing") {
        if (!selectedParentId) {
          toast.error("Ota-onani tanlang");
          return;
        }
        await assignParent(student.id, { parentId: selectedParentId });
      } else {
        if (!newParentName.trim() || !newParentPhone.trim()) {
          toast.error("Barcha maydonlarni to'ldiring");
          return;
        }
        await assignParent(student.id, {
          parentName: newParentName.trim(),
          parentPhone: newParentPhone.trim(),
          parentPassword: assignParentPassword.trim() || undefined,
        });
      }
      toast.success("Ota-ona muvaffaqiyatli biriktirildi");
      setAssignParentOpen(false);
      // Reset form
      setSelectedParentId("");
      setNewParentName("");
      setNewParentPhone("");
      setAssignParentPassword(genPin());
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail;
      toast.error(msg ?? "Xatolik yuz berdi");
    }
  };

  async function handleTransfer() {
    if (!student || !transferForm.fromGroupId || !transferForm.toGroupId) return;
    try {
      await transferApi.transfer({
        student_id: student.id,
        from_group_id: transferForm.fromGroupId,
        to_group_id: transferForm.toGroupId,
        transfer_date: transferForm.transferDate,
        reason: transferForm.reason,
        comment: transferForm.comment,
      });
      toast.success("O'quvchi muvaffaqiyatli ko'chirildi");
      setTransferOpen(false);
      await reload();
      // Reload transfers list
      transferApi.history({ student_id: student.id })
        .then((data) => setTransfers(Array.isArray(data) ? data : []))
        .catch((e) => console.error("Failed to load transfers", e));
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail;
      toast.error(msg ?? "Xatolik yuz berdi");
    }
  }

  const handleUpdateStudentPassword = () => {
    if (!student) return;
    if (!newStudentPassword.trim()) {
      toast.error("Parolni kiriting");
      return;
    }
    updateStudentPasswords(student.id, newStudentPassword.trim(), undefined);
    toast.success("O'quvchi paroli yangilandi");
    setNewStudentPassword("");
  };

  const handleUpdateParentPassword = () => {
    if (!student) return;
    if (!newParentPassword.trim()) {
      toast.error("Parolni kiriting");
      return;
    }
    updateStudentPasswords(student.id, undefined, newParentPassword.trim());
    toast.success("Ota-ona paroli yangilandi");
    setNewParentPassword("");
  };

  if (!student) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const studentGroups = groups.filter((g) => g.studentIds.includes(student.id));
  const parent = student.parentId ? parents.find((p) => p.id === student.parentId) : undefined;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-left">{student.fullName}</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <SheetDescription className="text-left">ID: {student.id}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-primary text-lg font-semibold text-primary-foreground shadow-elegant">
              {student.photo ? (
                <a href={student.photo} target="_blank" rel="noreferrer" className="size-full hover:opacity-80 transition-opacity">
                  <img src={student.photo} alt={student.fullName} className="size-full object-cover" />
                </a>
              ) : (
                student.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")
              )}
            </div>
            <div className="space-y-1">
              <StudentStatusBadge status={student.status} />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="size-3.5" /> {student.phone}
              </div>
              {student.birthDate && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarIcon className="size-3.5" /> {formatDate(student.birthDate, lang)}
                </div>
              )}
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">{t("students.col.balance")}</div>
              <div className={`text-xl font-semibold tabular-nums ${student.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatMoney(student.balance, lang)}
              </div>
            </div>
          </div>

          <Tabs defaultValue="main" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="main" className="flex-1">{t("students.tab.main")}</TabsTrigger>
              <TabsTrigger value="groups" className="flex-1">{t("students.tab.groups")}</TabsTrigger>
              <TabsTrigger value="finance" className="flex-1">{t("students.tab.finance")}</TabsTrigger>
              <TabsTrigger value="transfers" className="flex-1">Transferlar</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-3 pt-4">
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label={t("students.col.registered")} value={formatDate(student.registeredAt, lang)} />
                  <Field label={t("students.col.status")} value={t(`status.${student.status}`)} />
                  <Field label={t("students.field.phone")} value={student.phone} />
                  <Field label={t("students.field.birthDate")} value={student.birthDate ? formatDate(student.birthDate, lang) : "—"} />
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Parolni o'zgartirish</div>
                  <div className="flex gap-2 max-w-sm">
                    <PasswordInput value={newStudentPassword} onChange={(e) => setNewStudentPassword(e.target.value)} placeholder="Yangi parol (ixtiyoriy)" autoComplete="new-password" name="new-student-pwd" />
                    <Button variant="secondary" onClick={handleUpdateStudentPassword}>Saqlash</Button>
                  </div>
                </div>
              </Card>
              {parent ? (
                <Card className="p-4">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t("students.section.parent")}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary hover:text-primary/80 px-2"
                      onClick={() => {
                        setAssignType("existing");
                        setSelectedParentId(parent.id);
                        setAssignParentOpen(true);
                      }}
                    >
                      O'zgartirish
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Field label={t("students.field.parentName")} value={parent.fullName} />
                    <Field label={t("students.field.parentPhone")} value={parent.phone} />
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Ota-ona parolini o'zgartirish</div>
                    <div className="flex gap-2 max-w-sm">
                      <PasswordInput value={newParentPassword} onChange={(e) => setNewParentPassword(e.target.value)} placeholder="Yangi parol (ixtiyoriy)" autoComplete="new-password" name="new-parent-pwd" />
                      <Button variant="secondary" onClick={handleUpdateParentPassword}>Saqlash</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 border-dashed border-2 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">Ota-ona biriktirilmagan</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                    onClick={() => {
                      setAssignType("existing");
                      setSelectedParentId("");
                      setNewParentName("");
                      setNewParentPhone("");
                      setAssignParentPassword(genPin());
                      setAssignParentOpen(true);
                    }}
                  >
                    Ota-ona biriktirish
                  </Button>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="groups" className="space-y-2 pt-4">
              {studentGroups.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">{t("students.noGroups")}</Card>
              ) : (
                studentGroups.map((g) => (
                  <Card key={g.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(g.monthlyPrice, lang)} / {t("common.month").toLowerCase()}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="finance" className="space-y-2 pt-4">
              {(() => {
                const stuPayments = studentPayments
                  .filter((p) => p.direction === "in")
                  .sort((a, b) => b.date.localeCompare(a.date));
                if (stuPayments.length === 0) {
                  return (
                    <Card className="p-6 text-center text-sm text-muted-foreground">
                      {t("finance.empty")}
                    </Card>
                  );
                }
                return stuPayments.map((p) => {
                  const grp = p.groupId ? groups.find((g) => g.id === p.groupId) : undefined;
                  return (
                    <Card key={p.id} className="flex items-center gap-3 p-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
                        <Plus className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-success">+{formatMoney(p.amount, lang)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(p.date, lang)} · {t(`finance.method.${p.method}`)}
                          {grp ? ` · ${grp.name}` : ""}
                        </div>
                        {p.comment && <div className="text-[11px] text-muted-foreground truncate">{p.comment}</div>}
                      </div>
                    </Card>
                  );
                });
              })()}
            </TabsContent>

            <TabsContent value="transfers" className="space-y-2 pt-4">
              {transfers.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">Transferlar tarixi mavjud emas</Card>
              ) : (
                <Card className="overflow-hidden border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana</TableHead>
                        <TableHead>Dan</TableHead>
                        <TableHead>Ga</TableHead>
                        <TableHead>Sabab</TableHead>
                        <TableHead>Balans</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm">{t.transfer_date}</TableCell>
                          <TableCell className="text-sm">{t.from_group_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{t.to_group_name}</TableCell>
                          <TableCell className="text-sm">
                            {t.reason === "schedule_change" && "Dars jadvali o'zgarishi"}
                            {t.reason === "level_change" && "Daraja o'zgarishi"}
                            {t.reason === "branch_change" && "Filial o'zgarishi"}
                            {t.reason === "student_request" && "O'quvchi talabi"}
                            {t.reason === "other" && "Boshqa"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{formatMoney(Number(t.balance_at_transfer), lang)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="flex flex-col sm:flex-row gap-2 justify-between w-full">
          <div className="flex gap-2">
            <Button variant="outline" className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20" onClick={() => setShowDeleteConfirm(true)}>
              O'quvchini o'chirish
            </Button>
            {student.status !== "archived" && (
              <Button variant="outline" onClick={() => onArchive(student.id)}>
                {t("students.archive")}
              </Button>
            )}
            {student.status !== "archived" && (
              <Button
                variant="outline"
                onClick={() => {
                  setTransferForm({
                    fromGroupId: studentGroups[0]?.id ?? "",
                    toGroupId: "",
                    transferDate: new Date().toISOString().split("T")[0],
                    reason: "other",
                    comment: "",
                  });
                  setTransferOpen(true);
                }}
                disabled={studentGroups.length === 0}
              >
                Ko'chirish
              </Button>
            )}
          </div>
          <Button onClick={onClose}>{t("common.back")}</Button>
        </SheetFooter>
      </SheetContent>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O'quvchini o'chirish</DialogTitle>
            <DialogDescription>
              Rostdan ham o'quvchi <b>{student.fullName}</b> o'chirilsinmi? Bu amalni bekor qilib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>
          {parent && (
            <label className="flex items-center gap-2 cursor-pointer px-1 py-2">
              <Checkbox checked={deleteParentToo} onCheckedChange={(v) => setDeleteParentToo(v === true)} />
              <span className="text-sm">Ota-onani ham o'chirish ({parent.fullName})</span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteParentToo(false); }}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { onDelete(student.id, deleteParentToo); onClose(); setShowDeleteConfirm(false); setDeleteParentToo(false); }}>O'chirish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Guruhlararo ko'chirish</DialogTitle>
            <DialogDescription>
              O'quvchini boshqa guruhga ko'chirish. Balans o'zgarmaydi, dars narxi yangi guruh narxiga mos ravishda hisoblanadi.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Qaysi guruhdan</Label>
              <Select
                value={transferForm.fromGroupId}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, fromGroupId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Guruhni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {studentGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({formatMoney(g.monthlyPrice, lang)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Qaysi guruhga</Label>
              <Select
                value={transferForm.toGroupId}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, toGroupId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Guruhni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {groups
                    .filter((g) => g.id !== transferForm.fromGroupId && g.status === "active")
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({formatMoney(g.monthlyPrice, lang)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Ko'chirish sanasi</Label>
              <Input
                type="date"
                value={transferForm.transferDate}
                onChange={(e) => setTransferForm((f) => ({ ...f, transferDate: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Ko'chirish sababi</Label>
              <Select
                value={transferForm.reason}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="schedule_change">Dars jadvali o'zgarishi</SelectItem>
                  <SelectItem value="level_change">Daraja o'zgarishi</SelectItem>
                  <SelectItem value="branch_change">Filial o'zgarishi</SelectItem>
                  <SelectItem value="student_request">O'quvchi talabi</SelectItem>
                  <SelectItem value="other">Boshqa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Izoh</Label>
              <Textarea
                placeholder="Izoh yozing..."
                value={transferForm.comment}
                onChange={(e) => setTransferForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={handleTransfer}>
              Ko'chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Parent Dialog */}
      <Dialog open={assignParentOpen} onOpenChange={setAssignParentOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Ota-ona biriktirish</DialogTitle>
            <DialogDescription>
              Ushbu o'quvchiga mavjud ota-onani biriktirishingiz yoki yangi ota-ona yaratishingiz mumkin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Tabs value={assignType} onValueChange={(v) => setAssignType(v as "existing" | "new")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Mavjud ota-ona</TabsTrigger>
                <TabsTrigger value="new">Yangi ota-ona</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Ota-onani qidirish</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={parentSearch}
                      onChange={(e) => setParentSearch(e.target.value)}
                      placeholder="Ism yoki telefon raqami..."
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-border bg-background">
                  {filteredParents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">Ota-onalar topilmadi</div>
                  ) : (
                    filteredParents.slice(0, 10).map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedParentId(p.id)}
                        className={`flex items-center justify-between p-2.5 text-sm cursor-pointer transition-colors ${
                          selectedParentId === p.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-accent/40"
                        }`}
                      >
                        <div>
                          <div>{p.fullName}</div>
                          <div className="text-[11px] text-muted-foreground">{p.phone}</div>
                        </div>
                        {selectedParentId === p.id && <span className="text-xs text-primary font-semibold">Tanlandi</span>}
                      </div>
                    ))
                  )}
                  {filteredParents.length > 10 && (
                    <div className="p-2 text-center text-[10px] text-muted-foreground">
                      Yana {filteredParents.length - 10} ta ota-ona bor. Qidiruv orqali aniqlashtiring.
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="new" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="newParentName">Ota-onaning F.I.SH. *</Label>
                  <Input
                    id="newParentName"
                    placeholder="F.I.SH."
                    value={newParentName}
                    onChange={(e) => setNewParentName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newParentPhone">Telefon raqami *</Label>
                  <PhoneInput
                    id="newParentPhone"
                    value={newParentPhone}
                    onChange={(e) => setNewParentPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignParentPassword">Parol</Label>
                  <PasswordInput
                    id="assignParentPassword"
                    value={assignParentPassword}
                    onChange={(e) => setAssignParentPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="text-[11px] text-muted-foreground">Avtomatik yaratilgan parol. O'zgartirishingiz mumkin.</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignParentOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={handleAssignParent}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
