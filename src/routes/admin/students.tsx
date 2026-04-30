import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Phone, Calendar as CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function StudentsPage() {
  const { t, lang } = useI18n();
  const { students, groups, addStudent, archiveStudent } = useData();

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
                          <div className="flex size-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                            {s.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
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
      />
    </>
  );
}

function CreateStudentSheet({
  open,
  onOpenChange,
  onCreate,
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
}) {
  const { t } = useI18n();
  const { branches } = useData();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentPassword, setParentPassword] = useState("");

  const reset = () => {
    setFullName("");
    setPhone("");
    setPassword("");
    setBirthDate("");
    setParentName("");
    setParentPhone("");
    setParentPassword("");
  };

  const submit = () => {
    if (!fullName.trim() || !phone.trim() || !password.trim() || !branchId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    if ((parentName.trim() || parentPhone.trim()) && (!parentName.trim() || !parentPhone.trim() || !parentPassword.trim())) {
      toast.error(t("validation.fillAll"));
      return;
    }
    onCreate({
      fullName: fullName.trim(),
      phone: phone.trim(),
      password: password.trim(),
      birthDate: birthDate || undefined,
      branchId,
      parentName: parentName.trim() || undefined,
      parentPhone: parentPhone.trim() || undefined,
      parentPassword: parentPassword.trim() || undefined,
    });
    reset();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("students.add")}</SheetTitle>
          <SheetDescription>{t("students.section.student")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 py-6">
          <section className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("students.section.student")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("students.field.fullName")} *</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{t("students.field.phone")} *</Label>
                <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studentPassword">Password *</Label>
                <PasswordInput id="studentPassword" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t("students.field.birthDate")}</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
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

          <section className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("students.section.parent")} <span className="normal-case text-muted-foreground/70">({t("common.optional")})</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentName">{t("students.field.parentName")}</Label>
              <Input id="parentName" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentPhone">{t("students.field.parentPhone")}</Label>
              <PhoneInput id="parentPhone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentPassword">Parent password</Label>
              <PasswordInput id="parentPassword" value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </section>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} className="bg-gradient-primary text-primary-foreground">{t("common.create")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StudentDetailSheet({
  student,
  onClose,
  onArchive,
}: {
  student: Student | null;
  onClose: () => void;
  onArchive: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const { groups, parents } = useData();
  const open = student !== null;

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
            <div className="flex size-16 items-center justify-center rounded-xl bg-gradient-primary text-lg font-semibold text-primary-foreground shadow-elegant">
              {student.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
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
              <TabsTrigger value="documents" className="flex-1">{t("students.tab.documents")}</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-3 pt-4">
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label={t("students.col.registered")} value={formatDate(student.registeredAt, lang)} />
                  <Field label={t("students.col.status")} value={t(`status.${student.status}`)} />
                  <Field label={t("students.field.phone")} value={student.phone} />
                  <Field label={t("students.field.birthDate")} value={student.birthDate ? formatDate(student.birthDate, lang) : "—"} />
                </div>
              </Card>
              {parent && (
                <Card className="p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("students.section.parent")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <Field label={t("students.field.parentName")} value={parent.fullName} />
                    <Field label={t("students.field.parentPhone")} value={parent.phone} />
                  </div>
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
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {t("common.empty")}
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-2 pt-4">
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {t("students.docs.empty")}
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter>
          {student.status !== "archived" && (
            <Button variant="outline" onClick={() => onArchive(student.id)}>
              {t("students.archive")}
            </Button>
          )}
          <Button onClick={onClose}>{t("common.back")}</Button>
        </SheetFooter>
      </SheetContent>
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
