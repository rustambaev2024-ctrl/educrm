import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { quizApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface DraftAnswer {
  text: string;
}
interface DraftQuestion {
  text: string;
  time_limit: number;
  answers: DraftAnswer[];
  correctIndex: number;
}

const TIME_OPTIONS = [10, 20, 30];

export function QuizCreatePage({ basePath }: { basePath: "/admin" | "/teacher" }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quizType, setQuizType] = useState<"student" | "lead">("student");
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<DraftQuestion>({
    text: "",
    time_limit: 20,
    answers: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
    correctIndex: 0,
  });

  const resetDraft = () =>
    setDraft({
      text: "",
      time_limit: 20,
      answers: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
      correctIndex: 0,
    });

  const saveQuestion = () => {
    if (!draft.text.trim()) {
      toast.error(tr("Savol matnini kiriting", "Введите текст вопроса"));
      return;
    }
    const filled = draft.answers.filter((a) => a.text.trim());
    if (filled.length < 2) {
      toast.error(tr("Kamida 2 ta javob kiriting", "Введите минимум 2 ответа"));
      return;
    }
    if (!draft.answers[draft.correctIndex]?.text.trim()) {
      toast.error(tr("To'g'ri javobni tanlang", "Выберите правильный ответ"));
      return;
    }
    setQuestions((prev) => [...prev, draft]);
    resetDraft();
    setSheetOpen(false);
  };

  const removeQuestion = (idx: number) => setQuestions((prev) => prev.filter((_, i) => i !== idx));

  const createQuiz = async () => {
    if (!title.trim()) {
      toast.error(tr("Test nomini kiriting", "Введите название теста"));
      setStep(1);
      return;
    }
    if (questions.length === 0) {
      toast.error(tr("Kamida 1 ta savol qo'shing", "Добавьте минимум 1 вопрос"));
      return;
    }
    setSaving(true);
    try {
      const quiz = (await quizApi.create({
        title: title.trim(),
        description: description.trim(),
        quiz_type: quizType,
      })) as { id: string };

      // Создаём вопросы по очереди (с answers вложенно)
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const answers = q.answers
          .filter((a) => a.text.trim())
          .map((a, ai) => ({
            text: a.text.trim(),
            is_correct: ai === q.correctIndex,
            order: ai,
          }));
        await quizApi.addQuestion(quiz.id, {
          text: q.text.trim(),
          time_limit: q.time_limit,
          order: i,
          answers,
        });
      }

      toast.success(tr("Test yaratildi", "Тест создан"));
      navigate({ to: `${basePath}/quizzes` as string });
    } catch (err) {
      console.error("[quiz-create] failed", err);
      toast.error(tr("Testni yaratib bo'lmadi", "Не удалось создать тест"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title={tr("Yangi test", "Новый тест")}
      subtitle={tr("Test va savollarni qo'shing", "Добавьте тест и вопросы")}
      actions={
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => navigate({ to: `${basePath}/quizzes` as string })}>
          <ArrowLeft className="size-3.5" /> {tr("Orqaga", "Назад")}
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-[13px]">
          <span className={`flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${step === 1 ? "bg-[#0077b6] text-white" : "bg-emerald-600 text-white"}`}>
            {step === 1 ? "1" : <Check className="size-3.5" />}
          </span>
          <span className={step === 1 ? "font-medium" : "text-muted-foreground"}>{tr("Asosiy", "Основное")}</span>
          <div className="h-px w-8 bg-border" />
          <span className={`flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${step === 2 ? "bg-[#0077b6] text-white" : "bg-muted text-muted-foreground"}`}>2</span>
          <span className={step === 2 ? "font-medium" : "text-muted-foreground"}>{tr("Savollar", "Вопросы")}</span>
        </div>

        {step === 1 ? (
          <Card className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label>{tr("Test nomi", "Название теста")} *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Masalan: Ingliz tili A1", "Например: Английский A1")} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Tavsif", "Описание")}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={tr("Ixtiyoriy", "Опционально")} />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <div className="text-[13px] font-medium">{quizType === "lead" ? tr("Lidlar testi", "Тест для лидов") : tr("O'quvchilar testi", "Тест для учеников")}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {quizType === "lead"
                    ? tr("Ishtirokchilar kirishda ma'lumotlarini kiritadi", "Участники вводят свои данные при входе")
                    : tr("Faqat ism va telefon", "Только имя и телефон")}
                </div>
              </div>
              <Switch checked={quizType === "lead"} onCheckedChange={(v) => setQuizType(v ? "lead" : "student")} />
            </div>
            <div className="flex justify-end">
              <Button className="gap-1.5" onClick={() => setStep(2)} disabled={!title.trim()}>
                {tr("Keyingi", "Далее")} <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">{tr("Hali savollar yo'q", "Пока нет вопросов")}</Card>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <Card key={idx} className="flex items-start gap-3 p-4">
                    <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{idx + 1}. {q.text}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {q.answers.filter((a) => a.text.trim()).map((a, ai) => (
                          <span key={ai} className={`rounded-md px-2 py-0.5 text-[11px] ${ai === q.correctIndex ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                            {a.text}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{q.time_limit} {tr("soniya", "сек")}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeQuestion(idx)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}

            <Button variant="outline" className="w-full gap-1.5" onClick={() => { resetDraft(); setSheetOpen(true); }}>
              <Plus className="size-4" /> {tr("Savol qo'shish", "Добавить вопрос")}
            </Button>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" className="gap-1.5" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> {tr("Orqaga", "Назад")}
              </Button>
              <Button className="gap-1.5" onClick={createQuiz} disabled={saving || questions.length === 0}>
                <Check className="size-4" /> {saving ? tr("Saqlanmoqda...", "Сохранение...") : tr("Test yaratish", "Создать тест")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add-question sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{tr("Savol qo'shish", "Добавить вопрос")}</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Savol matni", "Текст вопроса")} *</Label>
              <Textarea value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Javob vaqti", "Время на ответ")}</Label>
              <div className="flex gap-2">
                {TIME_OPTIONS.map((t) => (
                  <Button key={t} type="button" variant={draft.time_limit === t ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setDraft((d) => ({ ...d, time_limit: t }))}>
                    {t} {tr("s", "с")}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tr("Javob variantlari", "Варианты ответов")}</Label>
              {draft.answers.map((a, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, correctIndex: ai }))}
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${draft.correctIndex === ai ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40"}`}
                    aria-label="correct"
                  >
                    {draft.correctIndex === ai && <Check className="size-3" />}
                  </button>
                  <Input
                    value={a.text}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, answers: d.answers.map((x, i) => (i === ai ? { text: e.target.value } : x)) }))
                    }
                    placeholder={`${tr("Variant", "Вариант")} ${ai + 1}`}
                    autoComplete="off"
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">{tr("Yashil doira — to'g'ri javob", "Зелёный кружок — правильный ответ")}</p>
            </div>
          </div>
          <SheetFooter className="mt-6 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button onClick={saveQuestion}>{tr("Saqlash", "Сохранить")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
