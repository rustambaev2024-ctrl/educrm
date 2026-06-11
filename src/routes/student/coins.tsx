import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Flame, Trophy, Lock, ShoppingBag, History, Star } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { coinApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useData } from "@/lib/data/store";
import { useCurrentStudentId } from "@/lib/data/identity";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/student/coins")({ component: StudentCoinsPage });

interface WalletData {
  balance: number; xp: number; level: number; streak: number; student_name?: string;
  level_thresholds?: { level: number; name_uz: string; name_ru: string; xp: number }[];
  next_level_xp?: number | null;
}
interface ProductData {
  id: string; name_uz: string; name_ru: string; description_uz: string; description_ru: string;
  price_coins: number; stock: number; min_level: number; is_active: boolean; image_url: string;
}
interface OrderData {
  id: string; product_name: { uz: string; ru: string }; status: string; coins_spent: number; created_at: string;
}
interface AchievementData {
  id: string; title_uz: string; title_ru: string; description_uz: string; description_ru: string;
  icon: string; condition_value: number; reward_coins: number; unlocked: boolean;
}
interface TxData {
  id: string; transaction_type: string; reason: string; amount: number; comment: string; created_at: string;
}

const LEVEL_COLORS = [
  "bg-slate-400", "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-amber-500",
];

const ORDER_STATUS: Record<string, { uz: string; ru: string; cls: string }> = {
  new: { uz: "Yangi", ru: "Новый", cls: "bg-blue-500/10 text-blue-600" },
  confirmed: { uz: "Tasdiqlangan", ru: "Подтверждён", cls: "bg-amber-500/10 text-amber-600" },
  delivered: { uz: "Yetkazildi", ru: "Доставлен", cls: "bg-emerald-500/10 text-emerald-600" },
  cancelled: { uz: "Bekor", ru: "Отменён", cls: "bg-red-500/10 text-red-600" },
};

const REASON_LABEL: Record<string, { uz: string; ru: string }> = {
  attendance: { uz: "Darsga kelish", ru: "Посещение" },
  grade: { uz: "Baho", ru: "Оценка" },
  homework: { uz: "Uy vazifasi", ru: "Домашка" },
  quiz: { uz: "Test", ru: "Тест" },
  streak: { uz: "Seriya bonusi", ru: "Бонус серии" },
  purchase: { uz: "Xarid", ru: "Покупка" },
  manual: { uz: "Qo'lda", ru: "Вручную" },
  penalty: { uz: "Jarima", ru: "Штраф" },
};

function StudentCoinsPage() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const studentId = useCurrentStudentId();
  const { students } = useData();
  const student = students.find((s) => s.id === studentId);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [transactions, setTransactions] = useState<TxData[]>([]);
  const [buyTarget, setBuyTarget] = useState<ProductData | null>(null);
  const [buying, setBuying] = useState(false);

  const loadAll = () => {
    coinApi.wallet.my().then((d) => setWallet(d as WalletData)).catch(() => {});
    coinApi.products.list().then((d) => setProducts(d as ProductData[])).catch(() => {});
    coinApi.orders.list().then((d) => setOrders(d as OrderData[])).catch(() => {});
    coinApi.achievements.list().then((d) => setAchievements(d as AchievementData[])).catch(() => {});
    coinApi.transactions.list().then((d) => setTransactions((d as TxData[]).slice(0, 20))).catch(() => {});
  };
  useEffect(loadAll, []);

  const confirmBuy = async () => {
    if (!buyTarget) return;
    setBuying(true);
    try {
      await coinApi.products.buy(buyTarget.id);
      toast.success(tr("Sotib olindi!", "Куплено!"));
      setBuyTarget(null);
      loadAll();
    } catch (err: unknown) {
      const msg = (err as { body?: { error?: string } })?.body?.error;
      const map: Record<string, string> = {
        "Insufficient coins": tr("Coin yetarli emas", "Недостаточно монет"),
        "Level too low": tr("Daraja yetarli emas", "Низкий уровень"),
        "Out of stock": tr("Tugagan", "Нет в наличии"),
        "Store is closed today": tr("Bugun do'kon yopiq", "Магазин сегодня закрыт"),
        "Weekly purchase limit reached": tr("Haftalik limit", "Лимит на неделю"),
        "Monthly purchase limit reached": tr("Oylik limit", "Лимит на месяц"),
      };
      toast.error(msg ? (map[msg] ?? msg) : tr("Xatolik", "Ошибка"));
    } finally {
      setBuying(false);
    }
  };

  if (!wallet) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const levelName = wallet.level_thresholds?.find((l) => l.level === wallet.level);
  const currentThreshold = wallet.level_thresholds?.find((l) => l.level === wallet.level)?.xp ?? 0;
  const nextXp = wallet.next_level_xp ?? null;
  const progressPct = nextXp && nextXp > currentThreshold
    ? Math.min(100, Math.round(((wallet.xp - currentThreshold) / (nextXp - currentThreshold)) * 100))
    : 100;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5 pb-24">
      {/* HEADER */}
      <Card className="overflow-hidden bg-gradient-primary p-5 text-primary-foreground shadow-glow">
        <div className="flex items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">
            {(student?.fullName ?? "").split(" ").slice(0, 2).map((p) => p[0]).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{student?.fullName}</div>
            <div className="mt-1 inline-flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${LEVEL_COLORS[(wallet.level - 1) % LEVEL_COLORS.length]}`}>
                {tr("Daraja", "Уровень")} {wallet.level}{levelName ? ` · ${lang === "uz" ? levelName.name_uz : levelName.name_ru}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* XP progress */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] opacity-90">
            <span>{wallet.xp} XP</span>
            <span>{nextXp ? `${nextXp} XP` : tr("Maksimal", "Максимум")}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Coins className="size-6" />
            <span className="text-2xl font-bold tabular-nums">{wallet.balance}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="size-5 text-orange-300" />
            <span className="text-lg font-semibold tabular-nums">{wallet.streak}</span>
            <span className="text-xs opacity-80">{tr("kun", "дн")}</span>
          </div>
        </div>
      </Card>

      {/* МАГАЗИН */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="size-4 text-primary" />{tr("Do'kon", "Магазин")}
        </h2>
        {products.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground shadow-elegant">{tr("Mahsulotlar yo'q", "Товаров нет")}</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => {
              const locked = wallet.level < p.min_level;
              const tooExpensive = wallet.balance < p.price_coins;
              const soldOut = p.stock === 0;
              return (
                <Card key={p.id} className="flex flex-col p-3 shadow-elegant">
                  <div className="mb-2 flex h-16 items-center justify-center rounded-xl bg-primary/5">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <Star className="size-7 text-primary/40" />
                    )}
                  </div>
                  <div className="min-h-8 text-sm font-medium leading-tight">{lang === "uz" ? p.name_uz : p.name_ru}</div>
                  {p.min_level > 1 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">★ {tr("Daraja", "Уровень")} {p.min_level}+</div>
                  )}
                  <div className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-amber-600">
                    <Coins className="size-3.5" />{p.price_coins}
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 h-8 w-full text-xs"
                    disabled={locked || tooExpensive || soldOut}
                    onClick={() => setBuyTarget(p)}
                  >
                    {locked ? <><Lock className="mr-1 size-3" />{tr("Yopiq", "Закрыто")}</>
                      : soldOut ? tr("Tugagan", "Нет")
                      : tooExpensive ? tr("Yetarli emas", "Недостаточно")
                      : tr("Sotib olish", "Купить")}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* МОИ ЗАКАЗЫ */}
      {orders.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="size-4 text-primary" />{tr("Mening xaridlarim", "Мои покупки")}
          </h2>
          <div className="space-y-2">
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
              return (
                <Card key={o.id} className="flex items-center gap-3 p-3 shadow-elegant">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{lang === "uz" ? o.product_name.uz : o.product_name.ru}</div>
                    <div className="text-[10px] text-muted-foreground">{formatDate(o.created_at, lang)}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Coins className="size-3.5" />{o.coins_spent}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{tr(st.uz, st.ru)}</span>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* АЧИВКИ */}
      {achievements.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-primary" />{tr("Yutuqlar", "Достижения")}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {achievements.map((a) => (
              <Card key={a.id} className={`flex flex-col items-center gap-1 p-3 text-center shadow-elegant ${a.unlocked ? "" : "opacity-50"}`}>
                <div className={`flex size-10 items-center justify-center rounded-xl ${a.unlocked ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                  {a.unlocked ? <Trophy className="size-5" /> : <Lock className="size-5" />}
                </div>
                <div className="text-[10px] font-medium leading-tight">{lang === "uz" ? a.title_uz : a.title_ru}</div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ИСТОРИЯ */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-primary" />{tr("Tarix", "История")}
        </h2>
        {transactions.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground shadow-elegant">{tr("Tarix yo'q", "Истории нет")}</Card>
        ) : (
          <div className="space-y-1.5">
            {transactions.map((tx) => {
              const positive = tx.amount > 0;
              const reason = REASON_LABEL[tx.reason];
              return (
                <Card key={tx.id} className="flex items-center justify-between p-2.5 shadow-elegant">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex size-7 items-center justify-center rounded-md text-xs font-bold ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                      {positive ? "+" : "−"}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{reason ? tr(reason.uz, reason.ru) : tx.reason}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(tx.created_at, lang)}</div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${positive ? "text-emerald-600" : "text-red-600"}`}>
                    {positive ? "+" : ""}{tx.amount}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* BUY CONFIRM */}
      <Dialog open={buyTarget !== null} onOpenChange={(v) => !v && setBuyTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{tr("Sotib olishni tasdiqlang", "Подтвердите покупку")}</DialogTitle>
            <DialogDescription>
              {buyTarget && (
                <>
                  {lang === "uz" ? buyTarget.name_uz : buyTarget.name_ru}
                  {" — "}
                  <span className="font-semibold text-amber-600">{buyTarget.price_coins} coin</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyTarget(null)} disabled={buying}>{tr("Bekor", "Отмена")}</Button>
            <Button onClick={confirmBuy} disabled={buying}>{tr("Sotib olish", "Купить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
