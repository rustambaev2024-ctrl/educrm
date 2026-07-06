import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Coins,
  ShoppingBag,
  Trophy,
  Lock,
  History,
  TrendingUp,
  TrendingDown,
  Flame,
  Star,
  Package,
  X,
} from "lucide-react";
import { coinApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate, initialsOf } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/student/coins")({ component: StudentCoins });

/**
 * Изображение товара: крупная картинка по image_url (клик — просмотр во весь экран).
 * При пустом/битом URL — иконка-заглушка.
 */
function ProductThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="flex h-24 w-full items-center justify-center rounded-xl"
        style={{ background: "#e0f2fe" }}
      >
        <ShoppingBag className="h-8 w-8 text-[#0077b6]" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group block h-24 w-full overflow-hidden rounded-xl border border-border bg-white transition-transform active:scale-95"
        aria-label={alt}
        title={alt}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      </button>

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 animate-in fade-in"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label={alt}
          >
            <X className="size-5" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

const getReasonLabel = (reason: string, lang: string) => {
  const labels: Record<string, { uz: string; ru: string }> = {
    attendance: { uz: "Darsga kelish",  ru: "Посещение урока" },
    grade:      { uz: "Baho uchun",     ru: "За оценку" },
    homework:   { uz: "Uy vazifasi",    ru: "Домашнее задание" },
    quiz:       { uz: "Test uchun",     ru: "За тест" },
    streak:     { uz: "Seriya bonusi",  ru: "Бонус серии" },
    purchase:   { uz: "Xarid",          ru: "Покупка" },
    manual:     { uz: "Qo'lda berildi", ru: "Начислено вручную" },
    penalty:    { uz: "Jarima",         ru: "Штраф" },
    adjustment: { uz: "Tuzatish",       ru: "Корректировка" },
  };
  const l = labels[reason];
  return l ? (lang === "uz" ? l.uz : l.ru) : reason;
};

const levelLabels: Record<number, { uz: string; ru: string }> = {
  1: { uz: "Boshlovchi", ru: "Начинающий" },
  2: { uz: "O'rta",      ru: "Средний" },
  3: { uz: "Ilg'or",     ru: "Продвинутый" },
  4: { uz: "Usta",       ru: "Мастер" },
  5: { uz: "Champion",   ru: "Чемпион" },
};

function StudentCoins() {
  const { lang } = useI18n();
  const { user } = useAuth();

  const [wallet, setWallet] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [buying, setBuying] = useState(false);

  const loadData = async () => {
    try {
      const [w, p, a, t, o] = await Promise.all([
        coinApi.wallet.my(),
        coinApi.products.list(),
        coinApi.achievements.list(),
        coinApi.transactions.list(),
        coinApi.orders.list(),
      ]);
      setWallet(w);
      setProducts(p?.results || p || []);
      setAchievements(a?.results || a || []);
      setTransactions((t?.results || t || []).slice(0, 10));
      setOrders(o?.results || o || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const canBuy = (product: any) =>
    (wallet?.balance || 0) >= product.price_coins &&
    (wallet?.level || 1) >= (product.min_level || 1);

  const handleBuy = (product: any) => {
    setBuyTarget(product);
  };

  const confirmBuy = async () => {
    if (!buyTarget) return;
    setBuying(true);
    try {
      await coinApi.products.buy(buyTarget.id);
      toast.success(lang === "uz" ? "Xarid muvaffaqiyatli!" : "Покупка успешна!");
      setBuyTarget(null);
      loadData();
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Insufficient")) {
        toast.error(lang === "uz" ? "Coin yetarli emas" : "Недостаточно монет");
      } else if (msg.includes("Level")) {
        toast.error(lang === "uz" ? "Daraja yetarli emas" : "Уровень недостаточный");
      } else if (msg.includes("limit")) {
        toast.error(lang === "uz" ? "Limit tugagan" : "Лимит исчерпан");
      } else {
        toast.error(lang === "uz" ? "Xatolik" : "Ошибка");
      }
    } finally {
      setBuying(false);
    }
  };

  const balance = wallet?.balance || 0;
  const xp = wallet?.xp || 0;
  const level = wallet?.level || 1;
  const streak = wallet?.streak || 0;
  const nextLevelXp: number | null = wallet?.next_level_xp ?? null;
  const xpProgress = nextLevelXp ? Math.min(100, Math.round((xp / nextLevelXp) * 100)) : 100;

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  const levelLabel = levelLabels[level]
    ? (lang === "uz" ? levelLabels[level].uz : levelLabels[level].ru)
    : (lang === "uz" ? `Daraja ${level}` : `Уровень ${level}`);

  const studentName = user?.fullName || "";
  const initials = initialsOf(studentName);
  const activeOrders = orders.filter((o) => o.status !== "cancelled").length;

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
    <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">

      {/* ── HERO CARD ── */}
      <div
        className="rounded-2xl p-5 text-white space-y-4"
        style={{ background: "linear-gradient(135deg, #0077b6 0%, #00b4d8 100%)" }}
      >
        {/* Avatar + Name + Level */}
        <div className="flex items-center gap-3">
          <div
            className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{
              width: 52,
              height: 52,
              background: "rgba(255,255,255,0.2)",
              fontSize: 18,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate">{studentName}</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.25)" }}
              >
                {lang === "uz" ? `Daraja ${level}` : `Уровень ${level}`}
              </span>
              <span className="text-xs" style={{ opacity: 0.8 }}>
                {levelLabel}
              </span>
            </div>
          </div>
        </div>

        {/* XP Progress */}
        <div className="space-y-1.5">
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${xpProgress}%`,
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>
          <div className="text-xs" style={{ opacity: 0.8 }}>
            {nextLevelXp
              ? (lang === "uz"
                  ? `${xp} / ${nextLevelXp} XP — keyingi darajaga`
                  : `${xp} / ${nextLevelXp} XP — до следующего уровня`)
              : (lang === "uz"
                  ? `${xp} XP — maksimal daraja!`
                  : `${xp} XP — максимальный уровень!`)}
          </div>
        </div>

        {/* Balance + Streak */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5" style={{ opacity: 0.9 }} />
            <span className="text-2xl font-bold">{balance}</span>
            <span className="text-sm" style={{ opacity: 0.8 }}>
              {lang === "uz" ? "coin" : "монет"}
            </span>
          </div>
          <div
            className="w-px self-stretch"
            style={{ background: "rgba(255,255,255,0.3)" }}
          />
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" style={{ opacity: 0.9 }} />
            <span className="text-lg font-bold">{streak}</span>
            <span className="text-sm" style={{ opacity: 0.8 }}>
              {lang === "uz" ? "kun seriya" : "дней серия"}
            </span>
          </div>
        </div>
      </div>

      {/* ── QUICK STATS ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Star className="h-5 w-5 text-[#0077b6] mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{level}</div>
          <div className="text-xs text-muted-foreground">
            {lang === "uz" ? "Daraja" : "Уровень"}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Package className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{activeOrders}</div>
          <div className="text-xs text-muted-foreground">
            {lang === "uz" ? "Xaridlar" : "Покупки"}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Trophy className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">
            {unlockedCount}/{totalCount || "?"}
          </div>
          <div className="text-xs text-muted-foreground">
            {lang === "uz" ? "Yutuqlar" : "Достижения"}
          </div>
        </div>
      </div>

      {/* ── SHOP ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-[#0077b6]" />
            {lang === "uz" ? "Do'kon" : "Магазин"}
          </h2>
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" />
            {balance} {lang === "uz" ? "coin" : "монет"}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {lang === "uz"
                ? "Do'kon hozircha bo'sh. Tez orada yangi sovg'alar!"
                : "Магазин пока пуст. Скоро появятся новые призы!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => {
              const buyable = canBuy(product);
              const noCoins = (wallet?.balance || 0) < product.price_coins;
              return (
                <div
                  key={product.id}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3"
                >
                  <ProductThumb
                    src={product.image_url}
                    alt={lang === "uz" ? product.name_uz : product.name_ru}
                  />

                  <div className="text-center">
                    <div className="font-semibold text-sm text-foreground leading-tight">
                      {lang === "uz" ? product.name_uz : product.name_ru}
                    </div>
                    {(product.min_level || 1) > 1 && (
                      <div className="text-xs text-amber-500 mt-0.5 flex items-center justify-center gap-0.5">
                        <Star className="h-3 w-3" />
                        {lang === "uz"
                          ? `Daraja ${product.min_level}+`
                          : `Уровень ${product.min_level}+`}
                      </div>
                    )}
                    {product.stock !== -1 && product.stock !== null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {lang === "uz"
                          ? `${product.stock} ta qoldi`
                          : `Осталось: ${product.stock}`}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto">
                    <div className="text-center font-bold text-[#0077b6] mb-2 flex items-center justify-center gap-1">
                      <Coins className="h-4 w-4" />
                      <span className="text-lg">{product.price_coins}</span>
                    </div>
                    <button
                      onClick={() => handleBuy(product)}
                      disabled={!buyable}
                      className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
                        buyable
                          ? "text-white hover:opacity-90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                      style={buyable ? { background: "#0077b6" } : undefined}
                    >
                      {!buyable
                        ? (noCoins
                            ? (lang === "uz" ? "Coin yetarli emas" : "Мало монет")
                            : (lang === "uz" ? "Daraja past" : "Уровень низкий"))
                        : (lang === "uz" ? "Sotib olish" : "Купить")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ACHIEVEMENTS ── */}
      {achievements.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {lang === "uz" ? "Yutuqlar" : "Достижения"}
            <span className="text-sm font-normal text-muted-foreground">
              ({unlockedCount}/{totalCount})
            </span>
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {achievements.map((ach) =>
              ach.unlocked ? (
                <div
                  key={ach.id}
                  className="bg-card border border-border rounded-xl p-3 text-center"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="text-xs font-semibold text-foreground leading-tight">
                    {lang === "uz" ? ach.title_uz : ach.title_ru}
                  </div>
                </div>
              ) : (
                <div
                  key={ach.id}
                  className="bg-card border border-border rounded-xl p-3 text-center opacity-40"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-xs text-muted-foreground">???</div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── TRANSACTION HISTORY ── */}
      <div className="space-y-2">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <History className="h-5 w-5 text-[#0077b6]" />
          {lang === "uz" ? "So'nggi faollik" : "Последняя активность"}
        </h2>

        {transactions.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {lang === "uz"
                ? "Hali faollik yo'q. Darslarga qatnashing!"
                : "Активности пока нет. Посещайте уроки!"}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl px-4 py-1">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    tx.amount > 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                  }`}
                >
                  {tx.amount > 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {getReasonLabel(tx.reason, lang)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(tx.created_at, lang)}
                  </div>
                </div>

                <div
                  className={`text-sm font-bold flex-shrink-0 flex items-center gap-0.5 ${
                    tx.amount > 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount}
                  <Coins className="h-3.5 w-3.5 ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={buyTarget !== null}
      onOpenChange={(open) => !open && setBuyTarget(null)}
      title={lang === "uz" ? "Xaridni tasdiqlash" : "Подтвердите покупку"}
      description={
        buyTarget
          ? (lang === "uz"
              ? `"${buyTarget.name_uz}" uchun ${buyTarget.price_coins} coin sarflanadi.`
              : `На "${buyTarget.name_ru}" будет потрачено ${buyTarget.price_coins} монет.`)
          : undefined
      }
      confirmText={lang === "uz" ? "Sotib olish" : "Купить"}
      cancelText={lang === "uz" ? "Bekor qilish" : "Отмена"}
      onConfirm={confirmBuy}
      isLoading={buying}
    />
    </>
  );
}
