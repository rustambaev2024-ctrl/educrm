import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coins, Plus, Minus, Trophy, Users, ShoppingBag, Flame } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/coins")({ component: AdminCoinsPage });

interface WalletData {
  id: string; balance: number; xp: number; level: number; streak: number;
  student_name: string; student_id: string;
}
interface OrderData {
  id: string; product_name: { uz: string; ru: string }; student_name: string;
  status: string; coins_spent: number; created_at: string;
}
interface LeaderRow {
  rank: number; student_name: string; xp: number; level: number; balance: number;
}

const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600", "bg-emerald-500/10 text-emerald-600",
  "bg-purple-500/10 text-purple-600", "bg-amber-500/10 text-amber-600",
  "bg-pink-500/10 text-pink-600",
];
const initials = (name: string) => name.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();
const colorFor = (name: string) => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

function AdminCoinsPage() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  return (
    <PageShell title="Coins" subtitle={tr("O'quvchilar coinlari va do'kon buyurtmalari", "Монеты учеников и заказы магазина")}>
      <Tabs defaultValue="students">
        <TabsList className="mb-4">
          <TabsTrigger value="students"><Users className="mr-1.5 size-4" />{tr("O'quvchilar", "Ученики")}</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="mr-1.5 size-4" />{tr("Buyurtmalar", "Заказы")}</TabsTrigger>
          <TabsTrigger value="leaders"><Trophy className="mr-1.5 size-4" />{tr("Liderlar", "Лидеры")}</TabsTrigger>
        </TabsList>

        <TabsContent value="students"><StudentsTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="leaders"><LeadersTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ── Вкладка 1: Студенты + начисление/списание ────────────────── */
function StudentsTab() {
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
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
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
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorFor(w.student_name)}`}>{initials(w.student_name)}</div>
                    <span className="font-medium">{w.student_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-amber-600"><span className="inline-flex items-center gap-1"><Coins className="size-3.5" />{w.balance}</span></TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{w.xp}</TableCell>
                <TableCell className="text-right font-medium">{w.level}</TableCell>
                <TableCell className="text-right"><span className="inline-flex items-center gap-1 text-orange-500"><Flame className="size-3.5" />{w.streak}</span></TableCell>
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
              <Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoComplete="off" />
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

/* ── Вкладка 2: Заказы ────────────────────────────────────────── */
const ORDER_STATUS: Record<string, { uz: string; ru: string; cls: string }> = {
  new: { uz: "Yangi", ru: "Новый", cls: "bg-blue-500/10 text-blue-600" },
  confirmed: { uz: "Tasdiqlangan", ru: "Подтверждён", cls: "bg-amber-500/10 text-amber-600" },
  delivered: { uz: "Yetkazildi", ru: "Доставлен", cls: "bg-emerald-500/10 text-emerald-600" },
  cancelled: { uz: "Bekor qilingan", ru: "Отменён", cls: "bg-red-500/10 text-red-600" },
};

function OrdersTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    coinApi.orders.list()
      .then((d) => setOrders(d as OrderData[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (id: string, status: string) => {
    if (status === "cancelled" && !window.confirm(tr("Bekor qilib, coinlarni qaytarishni tasdiqlaysizmi?", "Отменить и вернуть монеты?"))) return;
    try {
      await coinApi.orders.updateStatus(id, status);
      toast.success(tr("Yangilandi", "Обновлено"));
      load();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <Card className="overflow-hidden shadow-elegant">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr("O'quvchi", "Ученик")}</TableHead>
            <TableHead>{tr("Mahsulot", "Товар")}</TableHead>
            <TableHead className="text-right">{tr("Coin", "Монет")}</TableHead>
            <TableHead>{tr("Holat", "Статус")}</TableHead>
            <TableHead>{tr("Sana", "Дата")}</TableHead>
            <TableHead className="text-right">{tr("Amallar", "Действия")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{tr("Buyurtmalar yo'q", "Заказов нет")}</TableCell></TableRow>
          )}
          {orders.map((o) => {
            const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
            return (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.student_name}</TableCell>
                <TableCell>{lang === "uz" ? o.product_name.uz : o.product_name.ru}</TableCell>
                <TableCell className="text-right font-semibold text-amber-600">{o.coins_spent}</TableCell>
                <TableCell><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{tr(st.uz, st.ru)}</span></TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(o.created_at, lang)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {o.status === "new" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(o.id, "confirmed")}>{tr("Tasdiqlash", "Подтвердить")}</Button>}
                    {o.status === "confirmed" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(o.id, "delivered")}>{tr("Yetkazildi", "Доставлен")}</Button>}
                    {(o.status === "new" || o.status === "confirmed") && <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setStatus(o.id, "cancelled")}>{tr("Bekor", "Отмена")}</Button>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ── Вкладка 3: Лидерборд ─────────────────────────────────────── */
function LeadersTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coinApi.leaderboard.get()
      .then((d) => setRows(d as LeaderRow[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  if (rows.length === 0) {
    return <Card className="p-12 text-center text-sm text-muted-foreground shadow-elegant">{tr("Ma'lumot yo'q", "Данных нет")}</Card>;
  }

  const rankColor = (rank: number) =>
    rank === 1 ? "bg-amber-400 text-white"
    : rank === 2 ? "bg-slate-300 text-slate-700"
    : rank === 3 ? "bg-orange-400 text-white"
    : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.rank} className="flex items-center gap-3 p-3 shadow-elegant">
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankColor(r.rank)}`}>{r.rank}</div>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorFor(r.student_name)}`}>{initials(r.student_name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{r.student_name}</div>
            <div className="text-xs text-muted-foreground">{tr("Daraja", "Уровень")} {r.level}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">{r.xp} XP</div>
            <div className="inline-flex items-center gap-1 text-xs text-amber-600"><Coins className="size-3" />{r.balance}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
