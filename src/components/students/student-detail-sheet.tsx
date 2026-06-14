import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Minus, Search, Phone, Calendar as CalendarIcon, Copy,
  ArrowDownCircle, ArrowUpCircle, Key, Pencil, Coins,
} from "lucide-react";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { useData } from "@/lib/data/store";
import { formatDate, formatMoney, getLocalDateString } from "@/lib/format";
import type { Student } from "@/lib/data/types";
import { transferApi, paymentApi, studentApi, coinApi } from "@/lib/api";
import { mapPayments } from "@/lib/data/mappers";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

export function StudentDetailSheet({
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

  const STATUS_OPTIONS = [
    { value: "active",   uz: "Faol",        ru: "Активный",    color: "bg-emerald-500/10 text-emerald-600", textColor: "text-emerald-600" },
    { value: "frozen",   uz: "Muzlatilgan", ru: "Заморожен",   color: "bg-amber-500/10 text-amber-600",     textColor: "text-amber-600" },
    { value: "expelled", uz: "Chiqarilgan", ru: "Отчислен",    color: "bg-red-500/10 text-red-600",         textColor: "text-red-600" },
    { value: "graduate", uz: "Bitiruvchi",  ru: "Выпускник",   color: "bg-blue-500/10 text-blue-600",       textColor: "text-blue-600" },
    { value: "archived", uz: "Arxivlangan", ru: "Архивирован", color: "bg-muted text-muted-foreground",     textColor: "text-muted-foreground" },
  ] as const;

  const currentStatusOpt = STATUS_OPTIONS.find((s) => s.value === student?.status);

  const handleStatusChange = async (newStatus: string) => {
    if (!student || newStatus === student.status) return;
    const opt = STATUS_OPTIONS.find((s) => s.value === newStatus);
    const label = opt ? (lang === "uz" ? opt.uz : opt.ru) : newStatus;
    const confirmed = window.confirm(
      lang === "uz"
        ? `Holatni "${label}" ga o'zgartirishni tasdiqlaysizmi?`
        : `Изменить статус на "${label}"?`
    );
    if (!confirmed) return;
    try {
      await studentApi.updateStatus(student.id, newStatus);
      toast.success(lang === "uz" ? "Holat yangilandi" : "Статус обновлён");
      reload();
    } catch {
      toast.error(lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка");
    }
  };
  const open = student !== null;

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [coinDialogOpen, setCoinDialogOpen] = useState(false);
  const [coinAmount, setCoinAmount] = useState(10);
  const [coinComment, setCoinComment] = useState("");
  const [coinAction, setCoinAction] = useState<"award" | "deduct">("award");
  const [topUpForm, setTopUpForm] = useState({ amount: "", method: "cash", comment: "" });
  const [chargeForm, setChargeForm] = useState({ amount: "", comment: "", reason: "" });
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [newParentPassword, setNewParentPassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromGroupId: "",
    toGroupId: "",
    transferDate: getLocalDateString(),
    reason: "other",
    comment: "",
  });
  const [transfers, setTransfers] = useState<any[]>([]);
  const [studentPayments, setStudentPayments] = useState<any[]>([]);
  const [linkCodeOpen, setLinkCodeOpen] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [editStudentMode, setEditStudentMode] = useState(false);
  const [editStudentForm, setEditStudentForm] = useState({ fullName: "", phone: "", birthDate: "" });

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

  const handleGenerateLinkCode = async () => {
    if (!student) return;
    setLinkCodeLoading(true);
    try {
      const res = await studentApi.generateLinkCode(student.id) as any;
      setLinkCode(res.code);
      setLinkCodeOpen(true);
    } catch {
      toast.error(lang === "ru" ? "Ошибка" : "Xatolik");
    } finally {
      setLinkCodeLoading(false);
    }
  };

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
      setSelectedParentId("");
      setNewParentName("");
      setNewParentPhone("");
      setAssignParentPassword(genPin());
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail;
      toast.error(msg ?? "Xatolik yuz berdi");
    }
  };

  async function handleTopUp() {
    if (!student) return;
    if (!topUpForm.amount || Number(topUpForm.amount) <= 0) {
      toast.error("Summani kiriting");
      return;
    }
    try {
      await paymentApi.create({
        student_id: student.id,
        payment_type: "manual_top_up",
        amount: topUpForm.amount,
        method: topUpForm.method,
        comment: topUpForm.comment,
      });
      toast.success("Balans to'ldirildi");
      setTopUpOpen(false);
      setTopUpForm({ amount: "", method: "cash", comment: "" });
      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => console.error("Failed to load student payments", e));
      reload();
    } catch (err: any) {
      const msg = err?.body?.detail || "Xatolik yuz berdi";
      toast.error(msg);
    }
  }

  async function handleCharge() {
    if (!student) return;
    if (!chargeForm.amount || Number(chargeForm.amount) <= 0) {
      toast.error("Summani kiriting");
      return;
    }
    if (!chargeForm.reason.trim()) {
      toast.error("Sababni kiriting");
      return;
    }
    try {
      await paymentApi.create({
        student_id: student.id,
        payment_type: "manual_charge",
        amount: chargeForm.amount,
        comment: `${chargeForm.reason.trim()}${chargeForm.comment.trim() ? ` — ${chargeForm.comment.trim()}` : ""}`,
      });
      toast.success("Balansdan yechib olindi");
      setChargeOpen(false);
      setChargeForm({ amount: "", comment: "", reason: "" });
      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => console.error("Failed to load student payments", e));
      reload();
    } catch (err: any) {
      const msg = err?.body?.detail || "Xatolik yuz berdi";
      toast.error(msg);
    }
  }

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

  const handleArchive = async () => {
    if (!student) return;
    try {
      await studentApi.updateStatus(student.id, "archived");
      toast.success(lang === "uz" ? "Arxivlandi" : "Архивирован");
      setShowDeleteConfirm(false);
      reload();
      onClose();
    } catch {
      toast.error(lang === "uz" ? "Xatolik" : "Ошибка");
    }
  };

  const handleDelete = async () => {
    if (!student) return;
    const confirmed = window.confirm(
      lang === "uz"
        ? "O'quvchini arxivlashni tasdiqlaysizmi?"
        : "Архивировать студента?"
    );
    if (!confirmed) return;
    try {
      await studentApi.delete(student.id);
      toast.success(lang === "uz" ? "Arxivlandi" : "Архивирован");
      reload();
      onClose();
    } catch {
      toast.error(lang === "uz" ? "Xatolik" : "Ошибка");
    }
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
          <SheetTitle className="text-left">{student.fullName}</SheetTitle>
          <SheetDescription className="text-left">
            {student.phone} · {lang === "uz" ? "Ro'yxatdan o'tgan" : "Зарегистрирован"}: {formatDate(student.registeredAt, lang)}
          </SheetDescription>
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
              <span className={`text-sm font-medium ${currentStatusOpt?.textColor ?? "text-muted-foreground"}`}>
                {currentStatusOpt ? (lang === "uz" ? currentStatusOpt.uz : currentStatusOpt.ru) : student.status}
              </span>
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
              <div className="flex gap-2 mt-2 justify-end">
                <Button variant="outline" size="sm" className="text-success border-success/20 hover:bg-success hover:text-success-foreground" onClick={() => setTopUpOpen(true)}>
                  <ArrowDownCircle className="size-3.5 mr-1" /> To'ldirish
                </Button>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive hover:text-destructive-foreground" onClick={() => setChargeOpen(true)}>
                  <ArrowUpCircle className="size-3.5 mr-1" /> Yechish
                </Button>
                <Button variant="outline" size="sm" className="gap-1 border-amber-300 text-amber-600 hover:bg-amber-50" onClick={() => { setCoinAction("award"); setCoinAmount(10); setCoinComment(""); setCoinDialogOpen(true); }}>
                  <Coins className="size-3.5" />
                  {lang === "uz" ? "Coin" : "Монеты"}
                </Button>
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
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {lang === "uz" ? "Asosiy ma'lumotlar" : "Основные данные"}
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                    onClick={() => {
                      if (!editStudentMode) {
                        setEditStudentForm({
                          fullName: student.fullName ?? "",
                          phone: student.phone ?? "",
                          birthDate: student.birthDate ?? "",
                        });
                      }
                      setEditStudentMode(!editStudentMode);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editStudentMode ? (lang === "uz" ? "Bekor" : "Отмена") : (lang === "uz" ? "O'zgartirish" : "Изменить")}
                  </button>
                </div>
                {editStudentMode ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{lang === "uz" ? "F.I.Sh." : "ФИО"}</Label>
                      <Input value={editStudentForm.fullName} onChange={(e) => setEditStudentForm({ ...editStudentForm, fullName: e.target.value })} autoComplete="off" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{lang === "uz" ? "Telefon" : "Телефон"}</Label>
                      <Input value={editStudentForm.phone} onChange={(e) => setEditStudentForm({ ...editStudentForm, phone: e.target.value })} autoComplete="off" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{lang === "uz" ? "Tug'ilgan sana" : "Дата рождения"}</Label>
                      <Input type="date" value={editStudentForm.birthDate} onChange={(e) => setEditStudentForm({ ...editStudentForm, birthDate: e.target.value })} className="mt-1" />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={async () => {
                        try {
                          await studentApi.update(student.id, {
                            full_name: editStudentForm.fullName,
                            phone: editStudentForm.phone,
                            date_of_birth: editStudentForm.birthDate || null,
                          });
                          toast.success(lang === "uz" ? "Saqlandi" : "Сохранено");
                          setEditStudentMode(false);
                          reload();
                        } catch {
                          toast.error(lang === "uz" ? "Xatolik" : "Ошибка");
                        }
                      }}
                    >
                      {lang === "uz" ? "Saqlash" : "Сохранить"}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Field label={t("students.col.registered")} value={formatDate(student.registeredAt, lang)} />
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {t("students.col.status")}
                      </div>
                      <div className="mt-0.5">
                        <Select value={student.status || "active"} onValueChange={handleStatusChange}>
                          <SelectTrigger className="h-7 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${opt.color}`}>
                                  {lang === "uz" ? opt.uz : opt.ru}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Field label={t("students.field.phone")} value={student.phone} />
                    <Field label={t("students.field.birthDate")} value={student.birthDate ? formatDate(student.birthDate, lang) : "—"} />
                  </div>
                )}
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
                const stuPayments = [...studentPayments]
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
                  const isPositive = p.type === "top_up" || p.type === "discount" || p.type === "manual_top_up";
                  const Icon = isPositive ? Plus : Minus;
                  const colorClass = isPositive ? "text-success" : "text-destructive";
                  const bgClass = isPositive ? "bg-success/10" : "bg-destructive/10";
                  const sign = isPositive ? "+" : "-";

                  const typeLabels: Record<string, string> = {
                    top_up: "To'lov",
                    charge: "Dars uchun yechib olinish",
                    discount: "Chegirma",
                    refund: "Qaytarish",
                    expense: "Xarajat",
                    manual_top_up: "Qo'lda to'ldirish",
                    manual_charge: "Qo'lda yechish",
                  };
                  const typeLabel = typeLabels[p.type] || p.type;

                  return (
                    <Card key={p.id} className="flex items-center gap-3 p-3">
                      <div className={`flex size-9 items-center justify-center rounded-lg ${bgClass} ${colorClass}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${colorClass}`}>
                          {sign}{formatMoney(p.amount, lang)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(p.date, lang)} · {t(`finance.method.${p.method}`)} · {typeLabel}
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
            <Button variant="outline" size="sm" onClick={handleGenerateLinkCode} disabled={linkCodeLoading}>
              <Key className="mr-1 h-3.5 w-3.5" />
              {lang === "ru" ? "Код для родителя" : "Ota-ona kodi"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20"
              onClick={handleDelete}
            >
              {lang === "ru" ? "Удалить" : "O'chirish"}
            </Button>
            {student.status !== "archived" && (
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                {lang === "ru" ? "Архивировать" : "Arxivlash"}
              </Button>
            )}
            {student.status !== "archived" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransferForm({
                    fromGroupId: studentGroups[0]?.id ?? "",
                    toGroupId: "",
                    transferDate: getLocalDateString(),
                    reason: "other",
                    comment: "",
                  });
                  setTransferOpen(true);
                }}
                disabled={studentGroups.length === 0}
              >
                {lang === "ru" ? "Перевести" : "Ko'chirish"}
              </Button>
            )}
          </div>
          <Button onClick={onClose}>{t("common.back")}</Button>
        </SheetFooter>
      </SheetContent>

      {/* Delete Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ru" ? "Архивировать ученика" : "O'quvchini arxivlash"}</DialogTitle>
            <DialogDescription>
              {lang === "ru"
                ? <>Ученик <b>{student.fullName}</b> будет архивирован. Все данные сохранятся.</>
                : <>O'quvchi <b>{student.fullName}</b> arxivlanadi. Barcha ma'lumotlar saqlanadi.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleArchive}>
              {lang === "ru" ? "Архивировать" : "Arxivlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
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
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleTransfer}>Ko'chirish</Button>
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
            <Button variant="outline" onClick={() => setAssignParentOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleAssignParent}>Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Balansni to'ldirish</DialogTitle>
            <DialogDescription>O'quvchi balansiga qo'lda pul qo'shish</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Summa *</Label>
              <Input type="number" placeholder="0" autoComplete="off" value={topUpForm.amount} onChange={(e) => setTopUpForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>To'lov usuli</Label>
              <Select value={topUpForm.method} onValueChange={(v) => setTopUpForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Naqd</SelectItem>
                  <SelectItem value="card">Karta</SelectItem>
                  <SelectItem value="transfer">O'tkazma</SelectItem>
                  <SelectItem value="click">Click</SelectItem>
                  <SelectItem value="payme">Payme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Izoh</Label>
              <Textarea placeholder="Ixtiyoriy" value={topUpForm.comment} onChange={(e) => setTopUpForm(f => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleTopUp}>To'ldirish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Charge Dialog */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Balansdan yechib olish</DialogTitle>
            <DialogDescription>O'quvchi balansidan qo'lda pul yechish</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Summa *</Label>
              <Input type="number" placeholder="0" autoComplete="off" value={chargeForm.amount} onChange={(e) => setChargeForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Sabab *</Label>
              <Input placeholder="Kitob uchun, Jarima..." autoComplete="off" value={chargeForm.reason} onChange={(e) => setChargeForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Izoh</Label>
              <Textarea placeholder="Ixtiyoriy" value={chargeForm.comment} onChange={(e) => setChargeForm(f => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeOpen(false)}>Bekor qilish</Button>
            <Button variant="destructive" onClick={handleCharge}>Yechish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coin Dialog */}
      <Dialog open={coinDialogOpen} onOpenChange={setCoinDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {lang === "uz" ? "Coin berish / olish" : "Начислить / снять монеты"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCoinAction("award")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  coinAction === "award"
                    ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                + {lang === "uz" ? "Berish" : "Начислить"}
              </button>
              <button
                type="button"
                onClick={() => setCoinAction("deduct")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  coinAction === "deduct"
                    ? "bg-red-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                − {lang === "uz" ? "Olish" : "Снять"}
              </button>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {lang === "uz" ? "Miqdor" : "Количество"}
              </Label>
              <Input
                type="number"
                min={1}
                value={coinAmount}
                onChange={(e) => setCoinAmount(Number(e.target.value) || 1)}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {lang === "uz" ? "Sabab (ixtiyoriy)" : "Причина (необязательно)"}
              </Label>
              <Input
                value={coinComment}
                onChange={(e) => setCoinComment(e.target.value)}
                className="mt-1"
                autoComplete="off"
                placeholder={lang === "uz" ? "Masalan: Olimpiada g'olibi" : "Например: Победитель олимпиады"}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCoinDialogOpen(false)}>
              {lang === "uz" ? "Bekor" : "Отмена"}
            </Button>
            <Button
              className={coinAction === "award" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              onClick={async () => {
                if (!student) return;
                try {
                  if (coinAction === "award") {
                    await coinApi.wallet.award(student.id, coinAmount, coinComment);
                  } else {
                    await coinApi.wallet.deduct(student.id, coinAmount, coinComment);
                  }
                  toast.success(
                    lang === "uz"
                      ? `${coinAmount} coin ${coinAction === "award" ? "berildi" : "olindi"}`
                      : `${coinAmount} монет ${coinAction === "award" ? "начислено" : "снято"}`
                  );
                  setCoinDialogOpen(false);
                  setCoinAmount(10);
                  setCoinComment("");
                } catch {
                  toast.error(lang === "uz" ? "Xatolik" : "Ошибка");
                }
              }}
            >
              {coinAction === "award"
                ? (lang === "uz" ? "Berish" : "Начислить")
                : (lang === "uz" ? "Olish" : "Снять")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Code Dialog */}
      <Dialog open={linkCodeOpen} onOpenChange={setLinkCodeOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle>{lang === "ru" ? "Код для родителя" : "Ota-ona kodi"}</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <div className="text-5xl font-bold tracking-widest text-primary">{linkCode}</div>
            <p className="text-xs text-muted-foreground mt-3">
              {lang === "ru" ? "Код действует 24 часа" : "Kod 24 soat amal qiladi"}
            </p>
          </div>
          <Button onClick={() => { navigator.clipboard.writeText(linkCode ?? ""); toast.success("Nusxalandi"); }}>
            <Copy className="mr-1 h-4 w-4" />
            {lang === "ru" ? "Скопировать" : "Nusxalash"}
          </Button>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
