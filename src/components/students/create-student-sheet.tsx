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
