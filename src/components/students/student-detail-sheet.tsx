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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const { t, tf, lang } = useI18n();
  const { groups, parents, payments, updateStudentPasswords, assignParent, addStudentToGroup, reload } = useData();

  const STATUS_OPTIONS = [
    { value: "active",   uz: "Faol",        ru: "Активный",    color: "bg-emerald-500/10 text-emerald-600", textColor: "text-emerald-600" },
    { value: "frozen",   uz: "Muzlatilgan", ru: "Заморожен",   color: "bg-amber-500/10 text-amber-600",     textColor: "text-amber-600" },
    { value: "expelled", uz: "Chiqarilgan", ru: "Отчислен",    color: "bg-red-500/10 text-red-600",         textColor: "text-red-600" },
    { value: "graduate", uz: "Bitiruvchi",  ru: "Выпускник",   color: "bg-blue-500/10 text-blue-600",       textColor: "text-blue-600" },
    { value: "archived", uz: "Arxivlangan", ru: "Архивирован", color: "bg-muted text-muted-foreground",     textColor: "text-muted-foreground" },
  ] as const;

  const currentStatusOpt = STATUS_OPTIONS.find((s) => s.value === student?.status);

  const handleStatusChange = (newStatus: string) => {
    if (!student || newStatus === student.status) return;
    const opt = STATUS_OPTIONS.find((s) => s.value === newStatus);
    const label = opt ? (lang === "uz" ? opt.uz : opt.ru) : newStatus;
    const CLOSING_STATUSES = ["archived", "graduate", "expelled"];
    const isReturningToActive =
      CLOSING_STATUSES.includes(student.status) && newStatus === "active";
    const message = isReturningToActive
      ? (lang === "uz"
          ? "Diqqat: o'quvchi avval guruhlardan chiqarilgan edi. Statusni \"Faol\"ga qaytarish guruhlarni AVTOMATIK qaytarmaydi — kerakli guruhlarga qayta qo'shishingiz kerak bo'ladi. Davom etasizmi?"
          : "Внимание: студент ранее был выписан из групп. Возврат статуса в \"Активный\" НЕ восстановит группы автоматически — нужно будет заново добавить его в нужные группы. Продолжить?")
      : (lang === "uz"
          ? `Holatni "${label}" ga o'zgartirishni tasdiqlaysizmi?`
          : `Изменить статус на "${label}"?`);
    setStatusConfirm({ open: true, newStatus, message, isReturningToActive });
  };

  const handleStatusConfirm = async () => {
    if (!student) return;
    const { newStatus, isReturningToActive } = statusConfirm;
    setIsChangingStatus(true);
    try {
      await studentApi.updateStatus(student.id, newStatus);
      toast.success(lang === "uz" ? "Holat yangilandi" : "Статус обновлён");
      setStatusConfirm((prev) => ({ ...prev, open: false }));
      reload();
      if (isReturningToActive) {
        try {
          const resp = await studentApi.closedMemberships(student.id);
          if (resp.groups.length > 0) {
            setReconnectGroups(resp.groups);
            setReconnectChecked({});
            setReconnectOpen(true);
          }
        } catch (e) {
          console.error("Failed to load closed memberships", e);
        }
      }
    } catch {
      toast.error(lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка");
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleReconnect = async () => {
    if (!student) return;
    const ids = Object.entries(reconnectChecked)
      .filter(([, v]) => v)
      .map(([gid]) => gid);
    if (ids.length === 0) {
      setReconnectOpen(false);
      return;
    }
    for (const gid of ids) {
      addStudentToGroup(gid, student.id);
    }
    toast.success(
      lang === "uz"
        ? `${ids.length} ta guruhga qayta qo'shildi`
        : `Восстановлен в ${ids.length} групп(ах)`
    );
    setReconnectOpen(false);
    reload();
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{
    open: boolean;
    newStatus: string;
    message: string;
    isReturningToActive: boolean;
  }>({ open: false, newStatus: "", message: "", isReturningToActive: false });
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  type ClosedGroup = {
    group_id: string;
    group_name: string;
    group_status: string;
    current_count: number;
    capacity: number | null;
  };
  const [reconnectGroups, setReconnectGroups] = useState<ClosedGroup[]>([]);
  const [reconnectChecked, setReconnectChecked] = useState<Record<string, boolean>>({});
  const [reconnectOpen, setReconnectOpen] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromGroupId: "",
    toGroupId: "",
    transferDate: getLocalDateString(),
    reason: "other",
    comment: "",
  });
  const [transfers, setTransfers] = useState<any[]>([]);
  const [transfersError, setTransfersError] = useState(false);
  const [studentPayments, setStudentPayments] = useState<any[]>([]);
  const [paymentsError, setPaymentsError] = useState(false);
  const [linkCodeOpen, setLinkCodeOpen] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [editStudentMode, setEditStudentMode] = useState(false);
  const [editStudentForm, setEditStudentForm] = useState({ fullName: "", phone: "", birthDate: "" });

  useEffect(() => {
    if (student) {
      setTransfersError(false);
      transferApi.history({ student_id: student.id })
        .then((data) => setTransfers(Array.isArray(data) ? data : []))
        .catch((e) => {
          console.error("Failed to load transfers", e);
          setTransfers([]);
          setTransfersError(true);
        });

      setPaymentsError(false);
      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => {
          console.error("Failed to load student payments", e);
          setStudentPayments([]);
          setPaymentsError(true);
        });
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
          toast.error(t("sd.toast.selectParent"));
          return;
        }
        await assignParent(student.id, { parentId: selectedParentId });
      } else {
        if (!newParentName.trim() || !newParentPhone.trim()) {
          toast.error(t("sd.toast.fillAll"));
          return;
        }
        await assignParent(student.id, {
          parentName: newParentName.trim(),
          parentPhone: newParentPhone.trim(),
          parentPassword: assignParentPassword.trim() || undefined,
        });
      }
      toast.success(t("sd.toast.parentAssigned"));
      setAssignParentOpen(false);
      setSelectedParentId("");
      setNewParentName("");
      setNewParentPhone("");
      setAssignParentPassword(genPin());
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail;
      toast.error(msg ?? t("sd.toast.error"));
    }
  };

  async function handleTopUp() {
    if (!student) return;
    if (!topUpForm.amount || Number(topUpForm.amount) <= 0) {
      toast.error(t("sd.toast.enterAmount"));
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
      toast.success(t("sd.toast.balanceToppedUp"));
      setTopUpOpen(false);
      setTopUpForm({ amount: "", method: "cash", comment: "" });
      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => console.error("Failed to load student payments", e));
      reload();
    } catch (err: any) {
      const msg = err?.body?.detail || t("sd.toast.error");
      toast.error(msg);
    }
  }

  async function handleCharge() {
    if (!student) return;
    if (!chargeForm.amount || Number(chargeForm.amount) <= 0) {
      toast.error(t("sd.toast.enterAmount"));
      return;
    }
    if (!chargeForm.reason.trim()) {
      toast.error(t("sd.toast.enterReason"));
      return;
    }
    try {
      await paymentApi.create({
        student_id: student.id,
        payment_type: "manual_charge",
        amount: chargeForm.amount,
        comment: `${chargeForm.reason.trim()}${chargeForm.comment.trim() ? ` — ${chargeForm.comment.trim()}` : ""}`,
      });
      toast.success(t("sd.toast.charged"));
      setChargeOpen(false);
      setChargeForm({ amount: "", comment: "", reason: "" });
      paymentApi.list({ student_id: student.id })
        .then((data) => setStudentPayments(mapPayments(data as any)))
        .catch((e) => console.error("Failed to load student payments", e));
      reload();
    } catch (err: any) {
      const msg = err?.body?.detail || t("sd.toast.error");
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
      toast.success(t("sd.toast.transferred"));
      setTransferOpen(false);
      await reload();
      transferApi.history({ student_id: student.id })
        .then((data) => setTransfers(Array.isArray(data) ? data : []))
        .catch((e) => console.error("Failed to load transfers", e));
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail;
      toast.error(msg ?? t("sd.toast.error"));
    }
  }

  const handleUpdateStudentPassword = () => {
    if (!student) return;
    if (!newStudentPassword.trim()) {
      toast.error(t("sd.toast.enterPassword"));
      return;
    }
    updateStudentPasswords(student.id, newStudentPassword.trim(), undefined);
    toast.success(t("sd.toast.studentPwdUpdated"));
    setNewStudentPassword("");
  };

  const handleUpdateParentPassword = () => {
    if (!student) return;
    if (!newParentPassword.trim()) {
      toast.error(t("sd.toast.enterPassword"));
      return;
    }
    updateStudentPasswords(student.id, undefined, newParentPassword.trim());
    toast.success(t("sd.toast.parentPwdUpdated"));
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

  const handleDeleteConfirm = () => {
    if (!student) return;
    // Удаление делегируется родителю (onDelete → deleteStudent в сторе),
    // который делает оптимистичное обновление и сам вызывает DELETE.
    onDelete(student.id, false);
    setDeleteConfirmOpen(false);
    onClose();
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
      <SheetContent className="w-full sm:w-[560px] sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{student.fullName}</SheetTitle>
          <SheetDescription className="text-left">
            {student.phone} · {lang === "uz" ? "Ro'yxatdan o'tgan" : "Зарегистрирован"}: {formatDate(student.registeredAt, lang)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-primary text-lg font-semibold text-primary-foreground shadow-elegant sm:size-20">
                {student.photo ? (
                  <a href={student.photo} target="_blank" rel="noreferrer" className="size-full hover:opacity-80 transition-opacity">
                    <img src={student.photo} alt={student.fullName} className="size-full object-cover" />
                  </a>
                ) : (
                  student.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <span className={`block text-sm font-medium ${currentStatusOpt?.textColor ?? "text-muted-foreground"}`}>
                  {currentStatusOpt ? (lang === "uz" ? currentStatusOpt.uz : currentStatusOpt.ru) : student.status}
                </span>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" /> <span className="truncate">{student.phone}</span>
                </div>
                {student.birthDate && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarIcon className="size-3.5 shrink-0" /> <span className="truncate">{formatDate(student.birthDate, lang)}</span>
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-muted-foreground">{t("students.col.balance")}</div>
                <div className={`text-lg font-semibold tabular-nums sm:text-xl ${student.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatMoney(student.balance, lang)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" size="sm" className="flex-1 min-w-[110px] sm:flex-none text-success border-success/20 hover:bg-success hover:text-success-foreground" onClick={() => setTopUpOpen(true)}>
                <ArrowDownCircle className="size-3.5 mr-1" /> {t("sd.topUp")}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 min-w-[110px] sm:flex-none text-destructive border-destructive/20 hover:bg-destructive hover:text-destructive-foreground" onClick={() => setChargeOpen(true)}>
                <ArrowUpCircle className="size-3.5 mr-1" /> {t("sd.withdraw")}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 min-w-[110px] sm:flex-none gap-1 border-amber-300 text-amber-600 hover:bg-amber-50" onClick={() => { setCoinAction("award"); setCoinAmount(10); setCoinComment(""); setCoinDialogOpen(true); }}>
                <Coins className="size-3.5" />
                {lang === "uz" ? "Coin" : "Монеты"}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="main" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="main" className="flex-1">{t("students.tab.main")}</TabsTrigger>
              <TabsTrigger value="groups" className="flex-1">{t("students.tab.groups")}</TabsTrigger>
              <TabsTrigger value="finance" className="flex-1">{t("students.tab.finance")}</TabsTrigger>
              <TabsTrigger value="transfers" className="flex-1">{t("sd.tab.transfers")}</TabsTrigger>
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
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">{t("sd.changePassword")}</div>
                  <div className="flex gap-2 max-w-sm">
                    <PasswordInput value={newStudentPassword} onChange={(e) => setNewStudentPassword(e.target.value)} placeholder={t("sd.newPasswordOptional")} autoComplete="new-password" name="new-student-pwd" />
                    <Button variant="secondary" onClick={handleUpdateStudentPassword}>{t("common.save")}</Button>
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
                      {t("sd.change")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Field label={t("students.field.parentName")} value={parent.fullName} />
                    <Field label={t("students.field.parentPhone")} value={parent.phone} />
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">{t("sd.parentChangePassword")}</div>
                    <div className="flex gap-2 max-w-sm">
                      <PasswordInput value={newParentPassword} onChange={(e) => setNewParentPassword(e.target.value)} placeholder={t("sd.newPasswordOptional")} autoComplete="new-password" name="new-parent-pwd" />
                      <Button variant="secondary" onClick={handleUpdateParentPassword}>{t("common.save")}</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 border-dashed border-2 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">{t("sd.parentNotAssigned")}</div>
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
                    {t("sd.assignParent")}
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
                if (paymentsError) {
                  return (
                    <Card className="p-6 text-center text-sm text-destructive">
                      {t("sd.toast.error")}
                    </Card>
                  );
                }
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
                    top_up: t("sd.ptype.top_up"),
                    charge: t("sd.ptype.charge"),
                    discount: t("sd.ptype.discount"),
                    refund: t("sd.ptype.refund"),
                    expense: t("sd.ptype.expense"),
                    manual_top_up: t("sd.ptype.manual_top_up"),
                    manual_charge: t("sd.ptype.manual_charge"),
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
              {transfersError ? (
                <Card className="p-6 text-center text-sm text-destructive">{t("sd.toast.error")}</Card>
              ) : transfers.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">{t("sd.tr.empty")}</Card>
              ) : (
                <Card className="overflow-hidden border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("sd.tr.date")}</TableHead>
                        <TableHead>{t("sd.tr.from")}</TableHead>
                        <TableHead>{t("sd.tr.to")}</TableHead>
                        <TableHead>{t("sd.tr.reason")}</TableHead>
                        <TableHead>{t("sd.tr.balance")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm">{row.transfer_date}</TableCell>
                          <TableCell className="text-sm">{row.from_group_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{row.to_group_name}</TableCell>
                          <TableCell className="text-sm">
                            {row.reason === "schedule_change" && t("sd.reason.schedule_change")}
                            {row.reason === "level_change" && t("sd.reason.level_change")}
                            {row.reason === "branch_change" && t("sd.reason.branch_change")}
                            {row.reason === "student_request" && t("sd.reason.student_request")}
                            {row.reason === "other" && t("sd.reason.other")}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{formatMoney(Number(row.balance_at_transfer), lang)}</TableCell>
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
              onClick={() => setDeleteConfirmOpen(true)}
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

      {/* Reconnect Groups Dialog */}
      <Dialog open={reconnectOpen} onOpenChange={setReconnectOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {lang === "uz" ? "Guruhlarni qayta tiklash" : "Восстановить группы"}
            </DialogTitle>
            <DialogDescription>
              {lang === "uz"
                ? "O'quvchi quyidagi guruhlardan chiqarilgan edi. Qaytarmoqchi bo'lganlaringizni belgilang."
                : "Студент был выписан из этих групп. Отметьте те, в которые нужно вернуть."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
            {reconnectGroups.map((g) => {
              const isFull = g.capacity != null && g.current_count >= g.capacity;
              const isInactive = g.group_status !== "active" && g.group_status !== "recruiting";
              const disabled = isFull || isInactive;
              const hint = isInactive
                ? (lang === "uz" ? "Guruh endi faol emas" : "Группа больше не активна")
                : isFull
                ? (lang === "uz" ? "Guruh to'lgan" : "Группа заполнена")
                : null;
              return (
                <label
                  key={g.group_id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    disabled ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={!!reconnectChecked[g.group_id]}
                    onChange={(e) =>
                      setReconnectChecked((prev) => ({ ...prev, [g.group_id]: e.target.checked }))
                    }
                    className="size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{g.group_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {g.current_count}{g.capacity != null ? ` / ${g.capacity}` : ""}
                      {hint ? ` · ${hint}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconnectOpen(false)}>
              {lang === "uz" ? "O'tkazib yuborish" : "Пропустить"}
            </Button>
            <Button onClick={handleReconnect}>
              {lang === "uz" ? "Tanlanganlarni tiklash" : "Восстановить выбранные"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Delete (permanent) Confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={lang === "uz" ? "O'quvchini o'chirish" : "Удалить студента"}
        description={
          lang === "uz"
            ? "Bu amalni ortga qaytarib bo'lmaydi!"
            : "Это действие необратимо!"
        }
        confirmText={lang === "uz" ? "O'chirish" : "Удалить"}
        cancelText={lang === "uz" ? "Bekor qilish" : "Отмена"}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      {/* Status Change Confirm */}
      <ConfirmDialog
        open={statusConfirm.open}
        onOpenChange={(open) => setStatusConfirm((prev) => ({ ...prev, open }))}
        title={lang === "uz" ? "Holatni tasdiqlash" : "Подтвердите изменение статуса"}
        description={statusConfirm.message}
        confirmText={lang === "uz" ? "Davom etish" : "Продолжить"}
        cancelText={lang === "uz" ? "Bekor qilish" : "Отмена"}
        variant={statusConfirm.isReturningToActive ? "destructive" : "default"}
        onConfirm={handleStatusConfirm}
        isLoading={isChangingStatus}
      />

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sd.transferTitle")}</DialogTitle>
            <DialogDescription>
              {t("sd.transferDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("sd.fromGroup")}</Label>
              <Select
                value={transferForm.fromGroupId}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, fromGroupId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("sd.pickGroup")} />
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
              <Label>{t("sd.toGroup")}</Label>
              <Select
                value={transferForm.toGroupId}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, toGroupId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("sd.pickGroup")} />
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
              <Label>{t("sd.transferDate")}</Label>
              <Input
                type="date"
                value={transferForm.transferDate}
                onChange={(e) => setTransferForm((f) => ({ ...f, transferDate: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sd.transferReason")}</Label>
              <Select
                value={transferForm.reason}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="schedule_change">{t("sd.reason.schedule_change")}</SelectItem>
                  <SelectItem value="level_change">{t("sd.reason.level_change")}</SelectItem>
                  <SelectItem value="branch_change">{t("sd.reason.branch_change")}</SelectItem>
                  <SelectItem value="student_request">{t("sd.reason.student_request")}</SelectItem>
                  <SelectItem value="other">{t("sd.reason.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("sd.comment")}</Label>
              <Textarea
                placeholder={t("sd.commentPlaceholder")}
                value={transferForm.comment}
                onChange={(e) => setTransferForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleTransfer}>{t("sd.transfer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Parent Dialog */}
      <Dialog open={assignParentOpen} onOpenChange={setAssignParentOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sd.assignParent")}</DialogTitle>
            <DialogDescription>
              {t("sd.assignParentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Tabs value={assignType} onValueChange={(v) => setAssignType(v as "existing" | "new")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">{t("sd.existingParent")}</TabsTrigger>
                <TabsTrigger value="new">{t("sd.newParent")}</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{t("sd.searchParent")}</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={parentSearch}
                      onChange={(e) => setParentSearch(e.target.value)}
                      placeholder={t("sd.searchParentPlaceholder")}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-border bg-background">
                  {filteredParents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">{t("sd.parentsNotFound")}</div>
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
                        {selectedParentId === p.id && <span className="text-xs text-primary font-semibold">{t("sd.selected")}</span>}
                      </div>
                    ))
                  )}
                  {filteredParents.length > 10 && (
                    <div className="p-2 text-center text-[10px] text-muted-foreground">
                      {tf("sd.moreParents", { n: filteredParents.length - 10 })}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="new" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="newParentName">{t("sd.parentFullName")} *</Label>
                  <Input
                    id="newParentName"
                    placeholder={t("sd.namePlaceholder")}
                    value={newParentName}
                    onChange={(e) => setNewParentName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newParentPhone">{t("sd.phoneReq")} *</Label>
                  <PhoneInput
                    id="newParentPhone"
                    value={newParentPhone}
                    onChange={(e) => setNewParentPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignParentPassword">{t("sd.password")}</Label>
                  <PasswordInput
                    id="assignParentPassword"
                    value={assignParentPassword}
                    onChange={(e) => setAssignParentPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="text-[11px] text-muted-foreground">{t("sd.autoPasswordHint")}</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignParentOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleAssignParent}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sd.topUpTitle")}</DialogTitle>
            <DialogDescription>{t("sd.topUpDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("sd.amount")} *</Label>
              <Input type="number" placeholder="0" autoComplete="off" value={topUpForm.amount} onChange={(e) => setTopUpForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t("sd.payMethod")}</Label>
              <Select value={topUpForm.method} onValueChange={(v) => setTopUpForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("finance.method.cash")}</SelectItem>
                  <SelectItem value="card">{t("finance.method.card")}</SelectItem>
                  <SelectItem value="transfer">{t("finance.method.transfer")}</SelectItem>
                  <SelectItem value="click">Click</SelectItem>
                  <SelectItem value="payme">Payme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("sd.comment")}</Label>
              <Textarea placeholder={t("sd.optionalPlaceholder")} value={topUpForm.comment} onChange={(e) => setTopUpForm(f => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleTopUp}>{t("sd.topUp")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Charge Dialog */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sd.chargeTitle")}</DialogTitle>
            <DialogDescription>{t("sd.chargeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("sd.amount")} *</Label>
              <Input type="number" placeholder="0" autoComplete="off" value={chargeForm.amount} onChange={(e) => setChargeForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t("sd.reasonLabel")} *</Label>
              <Input placeholder={t("sd.reasonPlaceholder")} autoComplete="off" value={chargeForm.reason} onChange={(e) => setChargeForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t("sd.comment")}</Label>
              <Textarea placeholder={t("sd.optionalPlaceholder")} value={chargeForm.comment} onChange={(e) => setChargeForm(f => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleCharge}>{t("sd.withdraw")}</Button>
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
          <Button onClick={() => { navigator.clipboard.writeText(linkCode ?? ""); toast.success(t("sd.copied")); }}>
            <Copy className="mr-1 h-4 w-4" />
            {lang === "ru" ? "Скопировать" : "Nusxalash"}
          </Button>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
