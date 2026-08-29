import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, ReceiptText, Unlock } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { NumberInput } from "@/components/edu/number-input";
import { DateInput, todayIso } from "@/components/edu/date-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { expenseCategoryApi, periodCloseApi } from "@/lib/api";
import { apiErrorMessage, useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, getLocalDateTimeString } from "@/lib/format";
import type { PaymentMethod } from "@/lib/data/types";

export const Route = createFileRoute("/accountant/expenses")({ component: AccountantExpenses });

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "click", "payme"];

/** Сырая форма ответа API — см. ExpenseCategorySerializer на бэкенде. */
interface ExpenseCategory {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  active: boolean;
  created_at: string;
}

/** Сырая форма ответа API — см. PeriodCloseSerializer на бэкенде. */
interface PeriodCloseRaw {
  id: string;
  month: string;
  closed_by: string;
  closed_by_name: string;
  closed_at: string;
  reopened_by: string | null;
  reopened_by_name: string | null;
  reopened_at: string | null;
}

function AccountantExpenses() {
  const { t, lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const { branches, addPayment } = useData();

  // ---------------------------------------------------------------------
  // Категории (план счетов) — тянутся отдельным запросом, не часть useData().
  // ---------------------------------------------------------------------
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(false);

  const loadCategories = (opts?: { silent?: boolean }) => {
    // silent: true — фоновый рефреш после create/toggle. Не должен трогать
    // loading/error — иначе успешное действие сопровождается миганием
    // скелетона или (при временном сбое сети) заменой валидного списка на
    // полноэкранную ошибку.
    if (!opts?.silent) setCategoriesLoading(true);
    expenseCategoryApi
      .list()
      .then((data) => {
        setCategories(data as ExpenseCategory[]);
        if (!opts?.silent) setCategoriesError(false);
      })
      .catch((err) => {
        console.error("[accountant/expenses] category list fetch failed:", err);
        if (!opts?.silent) setCategoriesError(true);
        toast.error(apiErrorMessage(err));
      })
      .finally(() => {
        if (!opts?.silent) setCategoriesLoading(false);
      });
  };
  useEffect(() => {
    loadCategories();
  }, []);

  const activeCategories = useMemo(() => categories.filter((c) => c.active), [categories]);

  // ---------------------------------------------------------------------
  // Статус текущего периода — та же логика вычисления monthKey, что и в
  // accountant/index.tsx, намеренно не переизобретена заново.
  // ---------------------------------------------------------------------
  const monthKey = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-01`;
  }, []);

  const [periods, setPeriods] = useState<PeriodCloseRaw[]>([]);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [periodError, setPeriodError] = useState(false);

  const loadPeriods = (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPeriodLoading(true);
    periodCloseApi
      .list()
      .then((data) => {
        setPeriods(data as PeriodCloseRaw[]);
        if (!opts?.silent) setPeriodError(false);
      })
      .catch((err) => {
        console.error("[accountant/expenses] period-close list fetch failed:", err);
        if (!opts?.silent) setPeriodError(true);
        toast.error(apiErrorMessage(err));
      })
      .finally(() => {
        if (!opts?.silent) setPeriodLoading(false);
      });
  };
  useEffect(() => {
    loadPeriods();
  }, []);

  // Актуальная закрывающая запись текущего месяца (если её открыли заново —
  // reopened_at не null, и месяц снова считается открытым).
  const activeClose = useMemo(
    () => periods.find((p) => p.month === monthKey && p.reopened_at === null) ?? null,
    [periods, monthKey],
  );
  const isClosed = activeClose !== null;

  // ---------------------------------------------------------------------
  // Секция 1 — форма добавления расхода.
  // ---------------------------------------------------------------------
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [categoryId, setCategoryId] = useState("");
  const [backdate, setBackdate] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const resetExpenseForm = () => {
    setAmount("");
    setMethod("cash");
    setCategoryId("");
    setBackdate("");
    setComment("");
  };

  const handleSubmitExpense = async () => {
    // Защита от двойного клика: это списание денег, второй клик — второй расход.
    if (saving) return;
    const num = Number(amount);
    if (!categoryId || !Number.isFinite(num) || num <= 0) {
      toast.error(tr("Barcha majburiy maydonlarni to'ldiring", "Заполните все обязательные поля"));
      return;
    }
    setSaving(true);
    try {
      // addPayment резолвится в Payment на успехе и null на неудаче — стор
      // сам уже показал toast.error с причиной, второй раз кричать не нужно.
      const saved = await addPayment({
        branchId: branches[0]?.id ?? "",
        amount: num,
        direction: "out",
        type: "expense",
        method,
        date: getLocalDateTimeString(),
        comment: comment || undefined,
        categoryId,
        transactionDate: backdate || undefined,
      });
      if (!saved) return;
      toast.success(tr("Xarajat qo'shildi", "Расход добавлен"));
      resetExpenseForm();
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // Секция 2 — план счетов: добавление и активация/деактивация категорий.
  // ---------------------------------------------------------------------
  const [newCode, setNewCode] = useState("");
  const [newNameUz, setNewNameUz] = useState("");
  const [newNameRu, setNewNameRu] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const handleCreateCategory = async () => {
    if (creatingCategory) return;
    if (!newCode.trim() || !newNameUz.trim() || !newNameRu.trim()) {
      toast.error(tr("Barcha majburiy maydonlarni to'ldiring", "Заполните все обязательные поля"));
      return;
    }
    setCreatingCategory(true);
    try {
      await expenseCategoryApi.create({
        code: newCode.trim(),
        name_uz: newNameUz.trim(),
        name_ru: newNameRu.trim(),
      });
      toast.success(tr("Kategoriya qo'shildi", "Категория добавлена"));
      setNewCode("");
      setNewNameUz("");
      setNewNameRu("");
      loadCategories({ silent: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCreatingCategory(false);
    }
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const handleToggleCategory = async (category: ExpenseCategory) => {
    if (togglingId) return;
    setTogglingId(category.id);
    try {
      // update() умеет переключать active в обе стороны — деактивация и
      // обратная реактивация, поэтому отдельный deactivate() здесь не нужен.
      await expenseCategoryApi.update(category.id, { active: !category.active });
      loadCategories({ silent: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // ---------------------------------------------------------------------
  // Секция 3 — закрытие/переоткрытие периода.
  // ---------------------------------------------------------------------
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [periodActionLoading, setPeriodActionLoading] = useState(false);

  const handlePeriodAction = async () => {
    setPeriodActionLoading(true);
    try {
      if (isClosed && activeClose) {
        await periodCloseApi.reopen(activeClose.id);
        toast.success(tr("Davr qayta ochildi", "Период переоткрыт"));
      } else {
        await periodCloseApi.close(monthKey);
        toast.success(tr("Davr yopildi", "Период закрыт"));
      }
      setConfirmOpen(false);
      loadPeriods({ silent: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPeriodActionLoading(false);
    }
  };

  return (
    <PageShell
      title={tr("Xarajatlar va hisoblar rejasi", "Расходы и план счетов")}
      subtitle={tr(
        "Xarajat kiritish, kategoriyalarni boshqarish, davrni yopish",
        "Ввод расходов, управление категориями, закрытие периода",
      )}
    >
      <div className="space-y-6">
        {/* Секция 1 — добавление расхода */}
        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">
            {tr("Xarajat qo'shish", "Добавить расход")}
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("Kategoriya", "Категория")} *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {lang === "uz" ? c.name_uz : c.name_ru}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-amount" className="text-xs">
                  {tr("Summa", "Сумма")} *
                </Label>
                <NumberInput
                  id="expense-amount"
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="500000"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("Usul", "Способ оплаты")}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`finance.method.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-backdate" className="text-xs">
                  {tr(
                    "Sana (agar o'tgan sana bilan kiritish kerak bo'lsa)",
                    "Дата (если нужно указать прошлым числом)",
                  )}
                </Label>
                <DateInput
                  id="expense-backdate"
                  value={backdate}
                  onChange={(e) => setBackdate(e.target.value)}
                  maxDate={todayIso()}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-comment" className="text-xs">
                {tr("Izoh", "Комментарий")}
              </Label>
              <Textarea
                id="expense-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmitExpense} disabled={saving}>
                {saving ? "..." : tr("Saqlash", "Сохранить")}
              </Button>
            </div>
          </div>
        </Card>

        {/* Секция 2 — план счетов */}
        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">
            {tr("Hisoblar rejasi (xarajat kategoriyalari)", "План счетов (категории расходов)")}
          </div>

          {categoriesLoading ? (
            <div className="p-4">
              <ListSkeleton rows={3} />
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="size-7" />}
              title={tr("Kategoriyalar yo'q", "Категорий пока нет")}
              description={
                categoriesError
                  ? tr(
                      "Ro'yxatni yuklab bo'lmadi. Aloqani tekshiring.",
                      "Не удалось загрузить список. Проверьте связь.",
                    )
                  : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("Kod", "Код")}</TableHead>
                  <TableHead>{tr("Nomi (uz)", "Название (uz)")}</TableHead>
                  <TableHead>{tr("Nomi (ru)", "Название (ru)")}</TableHead>
                  <TableHead className="text-right">{tr("Holat", "Статус")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.code}</TableCell>
                    <TableCell>{c.name_uz}</TableCell>
                    <TableCell>{c.name_ru}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant={c.active ? "outline" : "destructive"} className="text-[10px]">
                          {c.active ? tr("Faol", "Активна") : tr("Nofaol", "Неактивна")}
                        </Badge>
                        <Switch
                          checked={c.active}
                          disabled={togglingId === c.id}
                          onCheckedChange={() => handleToggleCategory(c)}
                          aria-label={tr("Faollikni almashtirish", "Переключить активность")}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border-t border-border/60 p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {tr("Yangi kategoriya qo'shish", "Добавить новую категорию")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={tr("Kod", "Код")}
                aria-label={tr("Kod", "Код")}
              />
              <Input
                value={newNameUz}
                onChange={(e) => setNewNameUz(e.target.value)}
                placeholder={tr("Nomi (uz)", "Название (uz)")}
                aria-label={tr("Nomi (uz)", "Название (uz)")}
              />
              <Input
                value={newNameRu}
                onChange={(e) => setNewNameRu(e.target.value)}
                placeholder={tr("Nomi (ru)", "Название (ru)")}
                aria-label={tr("Nomi (ru)", "Название (ru)")}
              />
              <Button variant="outline" onClick={handleCreateCategory} disabled={creatingCategory}>
                <Plus className="mr-1 size-4" />
                {creatingCategory ? "..." : tr("Qo'shish", "Добавить")}
              </Button>
            </div>
          </div>
        </Card>

        {/* Секция 3 — закрытие/переоткрытие периода */}
        <Card className="overflow-hidden shadow-elegant">
          <div className="border-b border-border/60 p-4 text-sm font-semibold">
            {tr("Davr holati", "Статус периода")}
          </div>
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                  isClosed ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"
                }`}
              >
                {isClosed ? <Lock className="size-5" /> : <Unlock className="size-5" />}
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {periodLoading ? "…" : isClosed ? tr("Yopiq", "Закрыт") : tr("Ochiq", "Открыт")}
                </div>
                {isClosed && activeClose ? (
                  <div className="text-xs text-muted-foreground">
                    {tr("Yopdi", "Закрыл")}: {activeClose.closed_by_name} ·{" "}
                    {formatDateTime(activeClose.closed_at, lang)}
                  </div>
                ) : (
                  !periodLoading && (
                    <div className="text-xs text-muted-foreground">
                      {periodError
                        ? tr(
                            "Holatni yuklab bo'lmadi, taxminan ochiq deb ko'rsatilmoqda.",
                            "Не удалось загрузить статус, показан как открытый по умолчанию.",
                          )
                        : tr("Bu davr uchun xarajatlarni bekor qilish mumkin", "Отмена платежей за этот период разрешена")}
                    </div>
                  )
                )}
              </div>
            </div>
            <Button
              variant={isClosed ? "outline" : "destructive"}
              onClick={() => setConfirmOpen(true)}
              disabled={periodLoading}
            >
              {isClosed ? tr("Qayta ochish", "Переоткрыть") : tr("Oyni yopish", "Закрыть месяц")}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isClosed ? tr("Davrni qayta ochish", "Переоткрыть период") : tr("Davrni yopish", "Закрыть период")}
        description={
          isClosed
            ? tr(
                "Davr qayta ochiladi va bu oy uchun to'lovlarni yana bekor qilish mumkin bo'ladi.",
                "Период будет переоткрыт, и платежи за этот месяц снова можно будет отменять.",
              )
            : tr(
                "Davr yopilgach, hech kim — hatto direktor ham — bu oy uchun to'lovlarni bekor qila olmaydi, davr qayta ochilmaguncha. Davom etasizmi?",
                "После закрытия периода никто — включая директора — не сможет отменить платежи за этот месяц, пока период не будет переоткрыт. Продолжить?",
              )
        }
        confirmText={isClosed ? tr("Qayta ochish", "Переоткрыть") : tr("Yopish", "Закрыть")}
        cancelText={tr("Bekor qilish", "Отмена")}
        variant={isClosed ? "default" : "destructive"}
        onConfirm={handlePeriodAction}
        isLoading={periodActionLoading}
      />
    </PageShell>
  );
}
