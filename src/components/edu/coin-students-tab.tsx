import { useEffect, useMemo, useState } from "react";
import { Coins, Plus, Minus, Flame } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiErrorText } from "@/lib/api-error";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/edu/number-input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { coinApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { initialsOf } from "@/lib/format";
import { getAvatarColor } from "@/lib/avatar-color";

interface WalletData {
  id: string; balance: number; xp: number; level: number; streak: number;
  student_name: string; student_id: string;
}

/**
 * Кошельки учеников с начислением и списанием монет.
 *
 * Круг учеников определяет бэкенд по роли: директор видит центр целиком,
 * администратор — свой филиал, учитель — только учеников своих групп.
 * Поэтому один и тот же компонент подходит всем трём порталам.
 */
export function CoinStudentsTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const { students } = useData();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"award" | "deduct" | null>(null);
  const [form, setForm] = useState({ studentId: "", amount: "", comment: "" });

  const load = () => {
    setLoading(true);
    coinApi.wallet.list()
      .then((d) => setWallets(d as WalletData[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const activeStudents = useMemo(
    () => students.filter((s) => s.status !== "archived").sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students],
  );

  const open = (m: "award" | "deduct") => { setMode(m); setForm({ studentId: "", amount: "", comment: "" }); };

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.studentId || !amt || amt <= 0) {
      toast.error(tr("Ma'lumotni to'ldiring", "Заполните данные"));
      return;
    }
    try {
      if (mode === "award") await coinApi.wallet.award(form.studentId, amt, form.comment);
      else await coinApi.wallet.deduct(form.studentId, amt, form.comment);
      toast.success(tr("Bajarildi", "Выполнено"));
      setMode(null);
      load();
    } catch (err) {
      toast.error(apiErrorText(err, lang, tr("Xatolik", "Ошибка")));
    }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => open("award")}><Plus className="size-3.5" />{tr("Coin berish", "Начислить")}</Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => open("deduct")}><Minus className="size-3.5" />{tr("Coin olish", "Списать")}</Button>
      </div>

      <Card className="overflow-hidden shadow-elegant">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("O'quvchi", "Ученик")}</TableHead>
              <TableHead className="text-right">{tr("Balans", "Баланс")}</TableHead>
              <TableHead className="text-right">XP</TableHead>
              <TableHead className="text-right">{tr("Daraja", "Уровень")}</TableHead>
              <TableHead className="text-right">{tr("Seriya", "Серия")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallets.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{tr("Hamyonlar yo'q", "Кошельков нет")}</TableCell></TableRow>
            )}
            {wallets.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(w.student_name)}`}>{initialsOf(w.student_name)}</div>
                    <span className="font-medium">{w.student_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-warn"><span className="inline-flex items-center gap-1"><Coins className="size-3.5" />{w.balance}</span></TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{w.xp}</TableCell>
                <TableCell className="text-right font-medium">{w.level}</TableCell>
                <TableCell className="text-right"><span className="inline-flex items-center gap-1 text-warn"><Flame className="size-3.5" />{w.streak}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "award" ? tr("Coin berish", "Начислить монеты") : tr("Coin olish", "Списать монеты")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="mb-1 block text-xs">{tr("O'quvchi", "Ученик")} *</Label>
              <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {activeStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">{tr("Miqdor", "Количество")} *</Label>
              <NumberInput min={1} value={form.amount} onValueChange={(v) => setForm({ ...form, amount: v })} autoComplete="off" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">{mode === "deduct" ? tr("Sabab", "Причина") : tr("Izoh", "Комментарий")}</Label>
              <Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} autoComplete="off" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>{tr("Bekor", "Отмена")}</Button>
            <Button onClick={submit}>{tr("Tasdiqlash", "Подтвердить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

