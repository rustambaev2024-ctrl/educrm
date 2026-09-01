import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberInput } from "@/components/edu/number-input";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { getLocalDateTimeString } from "@/lib/format";

interface GrantBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Предвыбранный ученик — когда диалог открыт с карточки конкретного ученика. */
  initialStudentId?: string;
}

/**
 * Начисление бонусного баланса ученику — отдельный кошелёк, которым
 * оплачиваются уроки в первую очередь. Причина обязательна: как и у
 * штрафов/премий сотрудникам, начисление без обоснования не проходит.
 *
 * Общий для admin/finance и director/finance — оба портала начисляют
 * бонус одинаково, разница только в наборе студентов, который отдаёт
 * бэкенд по роли (см. CoinStudentsTab — тот же принцип общего компонента).
 */
export function GrantBonusDialog({ open, onOpenChange, initialStudentId }: GrantBonusDialogProps) {
  const { t, lang } = useI18n();
  const { students, branches, addPayment } = useData();
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setStudentId(initialStudentId ?? "");
  }, [open, initialStudentId]);

  const reset = () => {
    setStudentId(initialStudentId ?? "");
    setAmount("");
    setReason("");
  };

  const handleSave = async () => {
    // Защита от двойного нажатия: это начисление денег, второй клик — второе начисление.
    if (saving) return;
    const num = Number(amount);
    if (!studentId || !Number.isFinite(num) || num <= 0 || !reason.trim()) {
      toast.error(t("validation.fillAll"));
      return;
    }
    const student = students.find((s) => s.id === studentId);
    setSaving(true);
    try {
      const saved = await addPayment({
        studentId,
        branchId: student?.branchId ?? branches[0]?.id ?? "b1",
        amount: num,
        direction: "in",
        type: "top_up",
        method: "cash",
        date: getLocalDateTimeString(),
        comment: reason,
        fundingSource: "bonus",
      });
      // «Начислено» — только после ответа сервера. При ошибке стор уже
      // откатил bonusBalance и показал причину своим тостом, второй раз
      // кричать не нужно.
      if (!saved) return;
      toast.success(lang === "uz" ? "Bonus hisoblandi" : "Бонус начислен");
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === "uz" ? "Bonus hisoblash" : "Начислить бонус"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.student")} *</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!!initialStudentId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {students.filter((s) => s.status !== "archived").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("finance.col.amount")} *</Label>
            <NumberInput value={amount} onValueChange={setAmount} placeholder="50000" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{lang === "uz" ? "Sabab" : "Причина"} *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "..." : t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
