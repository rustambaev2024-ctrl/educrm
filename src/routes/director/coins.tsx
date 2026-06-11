import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Plus, Pencil, Trash2, Trophy, Package, ShoppingBag, Settings as SettingsIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/director/coins")({ component: DirectorCoinsPage });

interface LevelThreshold { level: number; name_uz: string; name_ru: string; xp: number }
interface CoinSettingData {
  coins_present: number; coins_late: number; coins_grade_perfect: number;
  coins_grade_good: number; coins_homework_done: number; coins_quiz_correct: number;
  coins_streak_7: number; coins_streak_30: number; xp_per_coin: number;
  level_thresholds: LevelThreshold[]; store_open_days: number[];
  max_purchases_per_week: number; max_purchases_per_month: number;
}
interface ProductData {
  id: string; name_uz: string; name_ru: string; description_uz: string; description_ru: string;
  price_coins: number; stock: number; min_level: number; is_active: boolean; image_url: string;
  category: string | null;
}
interface OrderData {
  id: string; product_name: { uz: string; ru: string }; student_name: string;
  status: string; coins_spent: number; created_at: string;
}
interface AchievementData {
  id: string; title_uz: string; title_ru: string; description_uz: string; description_ru: string;
  icon: string; condition_type: string; condition_value: number; reward_coins: number; is_active: boolean;
}

const WEEKDAYS = [
  { value: 0, uz: "Du", ru: "Пн" }, { value: 1, uz: "Se", ru: "Вт" },
  { value: 2, uz: "Ch", ru: "Ср" }, { value: 3, uz: "Pa", ru: "Чт" },
  { value: 4, uz: "Ju", ru: "Пт" }, { value: 5, uz: "Sh", ru: "Сб" },
  { value: 6, uz: "Ya", ru: "Вс" },
];

const CONDITION_TYPES = [
  { value: "streak", uz: "Seriya kunlari", ru: "Дни серии" },
  { value: "total_coins", uz: "Jami yig'ilgan coin", ru: "Всего монет" },
  { value: "level", uz: "Darajaga yetish", ru: "Достичь уровня" },
];

function DirectorCoinsPage() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  return (
    <PageShell title="Coins" subtitle={tr("Geymifikatsiya tizimini boshqarish", "Управление системой геймификации")}>
      <Tabs defaultValue="settings">
        <TabsList className="mb-4">
          <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 size-4" />{tr("Sozlamalar", "Настройки")}</TabsTrigger>
          <TabsTrigger value="store"><Package className="mr-1.5 size-4" />{tr("Do'kon", "Магазин")}</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="mr-1.5 size-4" />{tr("Buyurtmalar", "Заказы")}</TabsTrigger>
          <TabsTrigger value="achievements"><Trophy className="mr-1.5 size-4" />{tr("Yutuqlar", "Достижения")}</TabsTrigger>
        </TabsList>

        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="store"><StoreTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="achievements"><AchievementsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ── Вкладка 1: Настройки ─────────────────────────────────────── */
function SettingsTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const [data, setData] = useState<CoinSettingData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    coinApi.settings.get().then((d) => setData(d as CoinSettingData)).catch(() => {
      toast.error(tr("Yuklashda xatolik", "Ошибка загрузки"));
    });
  }, []);

  if (!data) {
    return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const num = (key: keyof CoinSettingData, v: string) => setData({ ...data, [key]: Number(v) || 0 });

  const save = async () => {
    setSaving(true);
    try {
      await coinApi.settings.update(data as unknown as Record<string, unknown>);
      toast.success(tr("Saqlandi", "Сохранено"));
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    } finally {
      setSaving(false);
    }
  };

  const NumberField = ({ label, k }: { label: string; k: keyof CoinSettingData }) => (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type="number" min={0} value={data[k] as number} onChange={(e) => num(k, e.target.value)} autoComplete="off" />
    </div>
  );

  const updateLevel = (idx: number, field: keyof LevelThreshold, v: string) => {
    const levels = [...data.level_thresholds];
    levels[idx] = { ...levels[idx], [field]: field === "name_uz" || field === "name_ru" ? v : Number(v) || 0 };
    setData({ ...data, level_thresholds: levels });
  };

  const addLevel = () => {
    const next = data.level_thresholds.length + 1;
    setData({ ...data, level_thresholds: [...data.level_thresholds, { level: next, name_uz: "", name_ru: "", xp: 0 }] });
  };

  const removeLevel = (idx: number) => {
    setData({ ...data, level_thresholds: data.level_thresholds.filter((_, i) => i !== idx) });
  };

  const toggleDay = (day: number) => {
    const days = data.store_open_days.includes(day)
      ? data.store_open_days.filter((d) => d !== day)
      : [...data.store_open_days, day].sort((a, b) => a - b);
    setData({ ...data, store_open_days: days });
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-elegant">
        <h3 className="mb-4 text-sm font-semibold">{tr("Avtomatik mukofotlar", "Автоматические начисления")}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <NumberField label={tr("Darsga kelganlik", "Присутствие")} k="coins_present" />
          <NumberField label={tr("Kechikish", "Опоздание")} k="coins_late" />
          <NumberField label={tr("10/10 baho", "Оценка 100%")} k="coins_grade_perfect" />
          <NumberField label={tr("8-9/10 baho", "Оценка 80%+")} k="coins_grade_good" />
          <NumberField label={tr("Uy vazifasi", "Домашка вовремя")} k="coins_homework_done" />
          <NumberField label={tr("Test (to'g'ri javob)", "Тест (верный ответ)")} k="coins_quiz_correct" />
        </div>
      </Card>

      <Card className="p-5 shadow-elegant">
        <h3 className="mb-4 text-sm font-semibold">{tr("Seriya bonuslari", "Бонусы за серию")}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <NumberField label={tr("7 kunlik seriya", "Серия 7 дней")} k="coins_streak_7" />
          <NumberField label={tr("30 kunlik seriya", "Серия 30 дней")} k="coins_streak_30" />
        </div>
      </Card>

      <Card className="p-5 shadow-elegant">
        <h3 className="mb-4 text-sm font-semibold">{tr("XP va darajalar", "XP и уровни")}</h3>
        <div className="mb-4 max-w-xs">
          <NumberField label={tr("XP kursi (1 coin = N XP)", "Курс XP (1 coin = N XP)")} k="xp_per_coin" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("Daraja", "Уровень")}</TableHead>
                <TableHead>{tr("Nomi (uz)", "Название (uz)")}</TableHead>
                <TableHead>{tr("Nomi (ru)", "Название (ru)")}</TableHead>
                <TableHead>XP</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.level_thresholds.map((lvl, idx) => (
                <TableRow key={idx}>
                  <TableCell><Input type="number" className="h-8 w-16" value={lvl.level} onChange={(e) => updateLevel(idx, "level", e.target.value)} /></TableCell>
                  <TableCell><Input className="h-8" value={lvl.name_uz} onChange={(e) => updateLevel(idx, "name_uz", e.target.value)} autoComplete="off" /></TableCell>
                  <TableCell><Input className="h-8" value={lvl.name_ru} onChange={(e) => updateLevel(idx, "name_ru", e.target.value)} autoComplete="off" /></TableCell>
                  <TableCell><Input type="number" className="h-8 w-24" value={lvl.xp} onChange={(e) => updateLevel(idx, "xp", e.target.value)} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => removeLevel(idx)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addLevel}>
          <Plus className="size-3.5" />{tr("Daraja qo'shish", "Добавить уровень")}
        </Button>
      </Card>

      <Card className="p-5 shadow-elegant">
        <h3 className="mb-4 text-sm font-semibold">{tr("Do'kon sozlamalari", "Настройки магазина")}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <NumberField label={tr("Haftalik maksimal xarid", "Макс. покупок в неделю")} k="max_purchases_per_week" />
          <NumberField label={tr("Oylik maksimal xarid", "Макс. покупок в месяц")} k="max_purchases_per_month" />
        </div>
        <div className="mt-4">
          <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">{tr("Do'kon ishlash kunlari", "Рабочие дни магазина")}</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                  data.store_open_days.includes(d.value)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {tr(d.uz, d.ru)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="size-4" />{tr("Saqlash", "Сохранить")}
        </Button>
      </div>
    </div>
  );
}

/* ── Вкладка 2: Магазин ───────────────────────────────────────── */
const emptyProduct = {
  name_uz: "", name_ru: "", description_uz: "", description_ru: "",
  price_coins: 100, stock: -1, min_level: 1, is_active: true, image_url: "", category: null as string | null,
};

function StoreTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyProduct });

  const load = () => {
    setLoading(true);
    coinApi.products.list()
      .then((d) => setProducts(d as ProductData[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditId(null); setForm({ ...emptyProduct }); setDialogOpen(true); };
  const openEdit = (p: ProductData) => {
    setEditId(p.id);
    setForm({
      name_uz: p.name_uz, name_ru: p.name_ru, description_uz: p.description_uz, description_ru: p.description_ru,
      price_coins: p.price_coins, stock: p.stock, min_level: p.min_level, is_active: p.is_active,
      image_url: p.image_url, category: p.category,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name_uz.trim() || !form.name_ru.trim()) {
      toast.error(tr("Nomni kiriting", "Введите название"));
      return;
    }
    try {
      const payload = { ...form, category: form.category || null };
      if (editId) await coinApi.products.update(editId, payload as unknown as Record<string, unknown>);
      else await coinApi.products.create(payload as unknown as Record<string, unknown>);
      toast.success(tr("Saqlandi", "Сохранено"));
      setDialogOpen(false);
      load();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(tr("Mahsulotni o'chirishni tasdiqlaysizmi?", "Удалить товар?"))) return;
    try {
      await coinApi.products.delete(id);
      toast.success(tr("O'chirildi", "Удалено"));
      load();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="size-3.5" />{tr("Mahsulot qo'shish", "Добавить товар")}</Button>
      </div>
      {products.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground shadow-elegant">{tr("Mahsulotlar yo'q", "Товаров нет")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="p-4 shadow-elegant">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate font-semibold">{lang === "uz" ? p.name_uz : p.name_ru}</h4>
                    {!p.is_active && <Badge variant="outline" className="text-[10px]">{tr("Nofaol", "Неактивен")}</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{lang === "uz" ? p.description_uz : p.description_ru}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => remove(p.id)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1 font-semibold text-amber-600"><Coins className="size-3.5" />{p.price_coins}</span>
                <span className="text-muted-foreground">· {tr("Daraja", "Уровень")} {p.min_level}+</span>
                <span className="text-muted-foreground">· {p.stock < 0 ? tr("Cheksiz", "∞") : `${tr("Qoldiq", "Остаток")}: ${p.stock}`}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? tr("Mahsulotni tahrirlash", "Редактировать товар") : tr("Mahsulot qo'shish", "Добавить товар")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs">{tr("Nomi (uz)", "Название (uz)")} *</Label><Input value={form.name_uz} onChange={(e) => setForm({ ...form, name_uz: e.target.value })} autoComplete="off" /></div>
              <div><Label className="mb-1 block text-xs">{tr("Nomi (ru)", "Название (ru)")} *</Label><Input value={form.name_ru} onChange={(e) => setForm({ ...form, name_ru: e.target.value })} autoComplete="off" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs">{tr("Tavsif (uz)", "Описание (uz)")}</Label><Textarea rows={2} value={form.description_uz} onChange={(e) => setForm({ ...form, description_uz: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">{tr("Tavsif (ru)", "Описание (ru)")}</Label><Textarea rows={2} value={form.description_ru} onChange={(e) => setForm({ ...form, description_ru: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="mb-1 block text-xs">{tr("Narx (coin)", "Цена (coin)")}</Label><Input type="number" min={0} value={form.price_coins} onChange={(e) => setForm({ ...form, price_coins: Number(e.target.value) || 0 })} /></div>
              <div><Label className="mb-1 block text-xs">{tr("Qoldiq (-1=∞)", "Остаток (-1=∞)")}</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} /></div>
              <div><Label className="mb-1 block text-xs">{tr("Min daraja", "Мин. уровень")}</Label><Input type="number" min={1} value={form.min_level} onChange={(e) => setForm({ ...form, min_level: Number(e.target.value) || 1 })} /></div>
            </div>
            <div><Label className="mb-1 block text-xs">{tr("Rasm URL", "URL картинки")}</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} autoComplete="off" /></div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v === true })} />
              {tr("Faol", "Активен")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tr("Bekor", "Отмена")}</Button>
            <Button onClick={save}>{tr("Saqlash", "Сохранить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Вкладка 3: Заказы ────────────────────────────────────────── */
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

/* ── Вкладка 4: Ачивки ────────────────────────────────────────── */
const emptyAch = {
  title_uz: "", title_ru: "", description_uz: "", description_ru: "",
  icon: "trophy", condition_type: "streak", condition_value: 7, reward_coins: 0, is_active: true,
};

function AchievementsTab() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyAch });

  const load = () => {
    setLoading(true);
    coinApi.achievements.list()
      .then((d) => setAchievements(d as AchievementData[]))
      .catch(() => toast.error(tr("Xatolik", "Ошибка")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditId(null); setForm({ ...emptyAch }); setDialogOpen(true); };
  const openEdit = (a: AchievementData) => {
    setEditId(a.id);
    setForm({
      title_uz: a.title_uz, title_ru: a.title_ru, description_uz: a.description_uz, description_ru: a.description_ru,
      icon: a.icon, condition_type: a.condition_type, condition_value: a.condition_value, reward_coins: a.reward_coins, is_active: a.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title_uz.trim() || !form.title_ru.trim()) {
      toast.error(tr("Nomni kiriting", "Введите название"));
      return;
    }
    try {
      if (editId) await coinApi.achievements.update(editId, form as unknown as Record<string, unknown>);
      else await coinApi.achievements.create(form as unknown as Record<string, unknown>);
      toast.success(tr("Saqlandi", "Сохранено"));
      setDialogOpen(false);
      load();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(tr("O'chirishni tasdiqlaysizmi?", "Удалить?"))) return;
    try {
      await coinApi.achievements.delete(id);
      toast.success(tr("O'chirildi", "Удалено"));
      load();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
    }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="size-3.5" />{tr("Yutuq qo'shish", "Добавить достижение")}</Button>
      </div>
      {achievements.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground shadow-elegant">{tr("Yutuqlar yo'q", "Достижений нет")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {achievements.map((a) => (
            <Card key={a.id} className="flex items-start gap-3 p-4 shadow-elegant">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><Trophy className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate font-semibold">{lang === "uz" ? a.title_uz : a.title_ru}</h4>
                  {!a.is_active && <Badge variant="outline" className="text-[10px]">{tr("Nofaol", "Неактивен")}</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {CONDITION_TYPES.find((c) => c.value === a.condition_type)?.[lang] ?? a.condition_type}: {a.condition_value}
                  {a.reward_coins > 0 && ` · +${a.reward_coins} coin`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(a)}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => remove(a.id)}><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? tr("Yutuqni tahrirlash", "Редактировать достижение") : tr("Yutuq qo'shish", "Добавить достижение")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs">{tr("Nomi (uz)", "Название (uz)")} *</Label><Input value={form.title_uz} onChange={(e) => setForm({ ...form, title_uz: e.target.value })} autoComplete="off" /></div>
              <div><Label className="mb-1 block text-xs">{tr("Nomi (ru)", "Название (ru)")} *</Label><Input value={form.title_ru} onChange={(e) => setForm({ ...form, title_ru: e.target.value })} autoComplete="off" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs">{tr("Tavsif (uz)", "Описание (uz)")}</Label><Input value={form.description_uz} onChange={(e) => setForm({ ...form, description_uz: e.target.value })} autoComplete="off" /></div>
              <div><Label className="mb-1 block text-xs">{tr("Tavsif (ru)", "Описание (ru)")}</Label><Input value={form.description_ru} onChange={(e) => setForm({ ...form, description_ru: e.target.value })} autoComplete="off" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs">{tr("Shart turi", "Тип условия")}</Label>
                <Select value={form.condition_type} onValueChange={(v) => setForm({ ...form, condition_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{tr(c.uz, c.ru)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1 block text-xs">{tr("Qiymat", "Значение")}</Label><Input type="number" min={0} value={form.condition_value} onChange={(e) => setForm({ ...form, condition_value: Number(e.target.value) || 0 })} /></div>
              <div><Label className="mb-1 block text-xs">{tr("Mukofot (coin)", "Награда (coin)")}</Label><Input type="number" min={0} value={form.reward_coins} onChange={(e) => setForm({ ...form, reward_coins: Number(e.target.value) || 0 })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v === true })} />
              {tr("Faol", "Активен")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tr("Bekor", "Отмена")}</Button>
            <Button onClick={save}>{tr("Saqlash", "Сохранить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
