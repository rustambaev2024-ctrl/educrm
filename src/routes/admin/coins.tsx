import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coins, Plus, Minus, Trophy, Users, ShoppingBag, Flame } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiErrorText } from "@/lib/api-error";
import { Input } from "@/components/ui/input";
import { CoinStudentsTab } from "@/components/edu/coin-students-tab";
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

        <TabsContent value="students"><CoinStudentsTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="leaders"><LeadersTab /></TabsContent>
      </Tabs>
    </PageShell>
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
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setLoading(true);
    coinApi.orders.list()
      .then((d) => setOrders(d as OrderData[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const applyStatus = async (id: string, status: string) => {
    try {
      await coinApi.orders.updateStatus(id, status);
      toast.success(tr("Yangilandi", "Обновлено"));
      load();
    } catch (err) {
      toast.error(apiErrorText(err, lang, tr("Xatolik", "Ошибка")));
    }
  };

  const setStatus = (id: string, status: string) => {
    if (status === "cancelled") {
      setCancelId(id);
      return;
    }
    void applyStatus(id, status);
  };

  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await applyStatus(cancelId, "cancelled");
      setCancelId(null);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <>
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
    <ConfirmDialog
      open={cancelId !== null}
      onOpenChange={(open) => !open && setCancelId(null)}
      title={tr("Buyurtmani bekor qilish", "Отменить заказ")}
      description={tr("Bekor qilinsa, coinlar o'quvchiga qaytariladi.", "При отмене монеты вернутся ученику.")}
      confirmText={tr("Bekor qilish", "Отменить")}
      cancelText={tr("Yopish", "Закрыть")}
      variant="destructive"
      onConfirm={confirmCancel}
      isLoading={cancelling}
    />
    </>
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
