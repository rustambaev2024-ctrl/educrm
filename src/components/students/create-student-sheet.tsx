import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { useI18n } from "@/lib/i18n";
import { useData } from "@/lib/data/store";

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
  const { t, lang } = useI18n();
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

  // Пароли генерируются автоматически при открытии, поэтому в расчёт
  // «тронута ли форма» не входят — иначе панель считалась бы заполненной
  // сразу же и спрашивала при каждом закрытии.
  const isDirty =
    fullName !== (initialData?.fullName ?? "") ||
    phone !== (initialData?.phone ?? "") ||
    birthDate !== "" ||
    hasParent ||
    parentName !== "" ||
    parentPhone !== "";

  const { askOpen, setAskOpen, requestClose, discard } = useUnsavedGuard(open && isDirty);

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
    <>
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (v) { onOpenChange(true); return; }
        // Случайно закрытая панель стирала всё заполненное без вопроса.
        requestClose(() => { onOpenChange(false); reset(); });
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("students.add")}</SheetTitle>
          <SheetDescription>{t("students.createSubtitle")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-1 py-6">
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("students.field.fullName")} *</Label>
                <Input id="fullName" placeholder={t("students.namePlaceholder")} value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
                <Label htmlFor="password">{t("students.password")}</Label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-[11px] text-muted-foreground">{t("students.passwordHint")}</p>
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
                <p className="text-[11px] text-muted-foreground">{t("students.parentHint")}</p>
              </div>
              <Switch checked={hasParent} onCheckedChange={setHasParent} />
            </div>

            {hasParent && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label htmlFor="parentName">{t("students.parentFullName")} *</Label>
                  <Input id="parentName" placeholder={t("students.namePlaceholder")} value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="parentPhone">{t("students.parentPhoneLabel")} *</Label>
                    <PhoneInput id="parentPhone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentPassword">{t("students.parentPassword")}</Label>
                    <PasswordInput id="parentPassword" value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} autoComplete="new-password" />
                    <p className="text-[11px] text-muted-foreground">{t("students.parentPasswordHint")}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
        <SheetFooter className="px-1 mt-4">
          <Button variant="outline" onClick={() => requestClose(() => { onOpenChange(false); reset(); })}>{t("common.cancel")}</Button>
          <Button onClick={submit} className="bg-gradient-primary text-primary-foreground">{t("students.submitAdd")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <ConfirmDialog
      open={askOpen}
      onOpenChange={setAskOpen}
      variant="destructive"
      title={lang === "uz" ? "Yopilsinmi?" : "Закрыть без сохранения?"}
      description={
        lang === "uz"
          ? "Kiritilgan ma'lumotlar saqlanmaydi."
          : "Введённые данные не сохранятся."
      }
      confirmText={lang === "uz" ? "Yopish" : "Закрыть"}
      cancelText={lang === "uz" ? "Tahrirni davom etish" : "Продолжить заполнение"}
      onConfirm={discard}
    />
    </>
  );
}
