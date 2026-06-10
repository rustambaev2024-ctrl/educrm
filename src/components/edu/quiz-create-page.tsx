import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Clock, Copy, Plus, Trash2, Check, ClipboardCheck } from "lucide-react";
import { quizApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnswerDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  id: string;
  text: string;
  timeLimit: number;
  answers: AnswerDraft[];
  isExisting?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ANSWER_COLORS = [
  { bg: "#e74c3c", icon: "▲" },
  { bg: "#2980b9", icon: "◆" },
  { bg: "#f39c12", icon: "●" },
  { bg: "#27ae60", icon: "■" },
];

const TIME_OPTIONS = [5, 10, 20, 30];

function createEmptyQuestion(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    text: "",
    timeLimit: 20,
    answers: [
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuizCreatePage({ basePath }: { basePath: "/admin" | "/teacher" }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const editId = new URLSearchParams(window.location.search).get("edit");

  const [title, setTitle] = useState("");
  const [quizType, setQuizType] = useState<"student" | "lead">("student");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestion()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const questionInputRef = useRef<HTMLTextAreaElement>(null);

  // Load quiz for editing
  useEffect(() => {
    if (!editId) return;
    quizApi.get(editId).then((quiz: any) => {
      setTitle(quiz.title ?? "");
      setQuizType(quiz.quiz_type ?? "student");
      if (quiz.questions?.length) {
        setQuestions(
          quiz.questions.map((q: any) => ({
            id: q.id,
            text: q.text,
            timeLimit: q.time_limit,
            isExisting: true,
            answers: Array.from({ length: 4 }, (_: unknown, i: number) => ({
              text: q.answers[i]?.text ?? "",
              isCorrect: q.answers[i]?.is_correct ?? false,
            })),
          }))
        );
      }
      setHasUnsaved(false);
    }).catch(() => {
      toast.error(tr("Testni yuklab bo'lmadi", "Не удалось загрузить тест"));
    });
  }, [editId]);

  // Warn on browser close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // ─── Mutation helpers ──────────────────────────────────────────────────────

  const addQuestion = () => {
    const newQ = createEmptyQuestion();
    setQuestions((prev) => [...prev, newQ]);
    setActiveIndex(questions.length);
    setHasUnsaved(true);
    setTimeout(() => questionInputRef.current?.focus(), 50);
  };

  const deleteQuestion = (index: number) => {
    if (questions.length === 1) {
      toast.error(tr("Kamida 1 ta savol kerak", "Нужен хотя бы 1 вопрос"));
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.min(prev, questions.length - 2));
    setHasUnsaved(true);
  };

  const duplicateQuestion = (index: number) => {
    const copy: QuestionDraft = {
      ...questions[index],
      id: crypto.randomUUID(),
      isExisting: false,
      answers: questions[index].answers.map((a) => ({ ...a })),
    };
    setQuestions((prev) => [
      ...prev.slice(0, index + 1),
      copy,
      ...prev.slice(index + 1),
    ]);
    setActiveIndex(index + 1);
    setHasUnsaved(true);
  };

  const updateQuestion = (index: number, field: keyof QuestionDraft, value: unknown) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
    setHasUnsaved(true);
  };

  const updateAnswer = (qIndex: number, aIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              answers: q.answers.map((a, ai) =>
                ai === aIndex ? { ...a, text: value } : a
              ),
            }
          : q
      )
    );
    setHasUnsaved(true);
  };

  const setCorrectAnswer = (qIndex: number, correctIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              answers: q.answers.map((a, ai) => ({
                ...a,
                isCorrect: ai === correctIndex,
              })),
            }
          : q
      )
    );
    setHasUnsaved(true);
  };

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(tr("Test nomini kiriting", "Введите название теста"));
      return;
    }
    if (questions.length === 0) {
      toast.error(tr("Kamida 1 ta savol qo'shing", "Добавьте хотя бы 1 вопрос"));
      return;
    }
    const invalidIdx = questions.findIndex(
      (q) =>
        !q.text.trim() ||
        !q.answers.some((a) => a.isCorrect) ||
        q.answers.filter((a) => a.text.trim()).length < 2
    );
    if (invalidIdx >= 0) {
      setActiveIndex(invalidIdx);
      toast.error(
        tr(`${invalidIdx + 1}-savol to'liq emas`, `Вопрос ${invalidIdx + 1} заполнен не полностью`)
      );
      return;
    }

    setIsSaving(true);
    try {
      let quizId = editId;

      if (!editId) {
        const quiz = (await quizApi.create({ title: title.trim(), quiz_type: quizType })) as { id: string };
        quizId = quiz.id;
      } else {
        await quizApi.update(editId, { title: title.trim(), quiz_type: quizType });
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const payload = {
          text: q.text.trim(),
          order: i,
          time_limit: q.timeLimit,
          answers: q.answers
            .filter((a) => a.text.trim())
            .map((a, ai) => ({
              text: a.text.trim(),
              is_correct: a.isCorrect,
              order: ai,
            })),
        };
        if (q.isExisting) {
          await quizApi.updateQuestion(quizId!, q.id, payload);
        } else {
          await quizApi.addQuestion(quizId!, payload);
        }
      }

      setHasUnsaved(false);
      toast.success(tr("Test saqlandi!", "Тест сохранён!"));
      navigate({ to: `${basePath}/quizzes` as string });
    } catch {
      toast.error(tr("Xatolik yuz berdi", "Произошла ошибка"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (hasUnsaved) {
      const ok = window.confirm(
        tr(
          "Saqlashtirilmagan o'zgarishlar yo'qoladi. Davom etasizmi?",
          "Несохранённые изменения будут потеряны. Продолжить?"
        )
      );
      if (!ok) return;
    }
    navigate({ to: `${basePath}/quizzes` as string });
  };

  const activeQ = questions[activeIndex] ?? null;
  const canSave = title.trim().length > 0 && questions.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "52px 1fr",
        gridTemplateColumns: "260px 1fr",
        height: "100vh",
        overflow: "hidden",
        background: "#1a1a2e",
      }}
    >
      {/* ── HEADER (full width) ────────────────────────────────────────────── */}
      <div
        style={{
          gridColumn: "1 / -1",
          background: "#16213e",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* Back */}
        <button
          onClick={handleBack}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronLeft className="h-5 w-5" style={{ color: "white" }} />
        </button>

        {/* Title input */}
        <TitleInput
          value={title}
          onChange={(v) => { setTitle(v); setHasUnsaved(true); }}
          placeholder={tr("Test nomini kiriting...", "Введите название теста...")}
        />

        {/* Type toggle */}
        <div
          style={{
            display: "flex",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.2)",
            flexShrink: 0,
          }}
        >
          <TypeBtn
            active={quizType === "student"}
            onClick={() => { setQuizType("student"); setHasUnsaved(true); }}
            label={tr("O'quvchilar", "Студенты")}
          />
          <TypeBtn
            active={quizType === "lead"}
            onClick={() => { setQuizType("lead"); setHasUnsaved(true); }}
            label={tr("Lidlar", "Лиды")}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          style={{
            background: "#16a34a",
            color: "white",
            borderRadius: 8,
            padding: "8px 20px",
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: canSave && !isSaving ? "pointer" : "not-allowed",
            opacity: canSave && !isSaving ? 1 : 0.5,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {isSaving ? tr("Saqlanmoqda...", "Сохранение...") : tr("Saqlash", "Сохранить")}
        </button>
      </div>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#16213e",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, paddingTop: 8, paddingBottom: 4 }}>
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              active={activeIndex === i}
              lang={lang}
              onClick={() => setActiveIndex(i)}
              onDuplicate={() => duplicateQuestion(i)}
              onDelete={() => deleteQuestion(i)}
            />
          ))}
        </div>

        <button
          onClick={addQuestion}
          style={{
            margin: "4px 8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "#0077b6",
            color: "white",
            borderRadius: 12,
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#00b4d8")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#0077b6")}
        >
          <Plus className="h-4 w-4" />
          {tr("Savol qo'shish", "Добавить вопрос")}
        </button>
      </div>

      {/* ── QUESTION EDITOR ────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#0f3460",
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {!activeQ ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <ClipboardCheck style={{ width: 64, height: 64, opacity: 0.3 }} />
            <p style={{ fontSize: 16, textAlign: "center" }}>
              {tr(
                "Savol qo'shish uchun chapdan + tugmasini bosing",
                "Нажмите + слева чтобы добавить вопрос"
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Timer row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                {tr("Vaqt:", "Время:")}
              </span>
              {TIME_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => updateQuestion(activeIndex, "timeLimit", sec)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background:
                      activeQ.timeLimit === sec ? "#0077b6" : "rgba(255,255,255,0.1)",
                    color: activeQ.timeLimit === sec ? "white" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Question text */}
            <div
              style={{
                background: "white",
                borderRadius: 16,
                padding: 16,
                minHeight: 100,
                cursor: "text",
              }}
              onClick={() => questionInputRef.current?.focus()}
            >
              <textarea
                ref={questionInputRef}
                value={activeQ.text}
                onChange={(e) => updateQuestion(activeIndex, "text", e.target.value)}
                placeholder={tr(
                  "Savolingizni shu yerga yozing...",
                  "Напишите ваш вопрос здесь..."
                )}
                rows={3}
                style={{
                  width: "100%",
                  fontSize: 18,
                  fontWeight: 500,
                  color: "#1a1a2e",
                  resize: "none",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Answer grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {ANSWER_COLORS.map((color, ai) => (
                <AnswerCard
                  key={ai}
                  color={color}
                  answer={activeQ.answers[ai]}
                  answerIndex={ai}
                  lang={lang}
                  onChange={(val) => updateAnswer(activeIndex, ai, val)}
                  onSetCorrect={() => setCorrectAnswer(activeIndex, ai)}
                />
              ))}
            </div>

            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
              {tr(
                "To'g'ri javobni belgilash uchun aylana tugmasini bosing",
                "Нажмите кружок чтобы отметить правильный ответ"
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TitleInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        flex: 1,
        background: "transparent",
        color: "white",
        fontSize: 16,
        fontWeight: 600,
        border: "none",
        borderBottom: focused
          ? "2px solid #0077b6"
          : "2px solid rgba(255,255,255,0.3)",
        outline: "none",
        padding: "4px 0",
        fontFamily: "inherit",
      }}
    />
  );
}

function TypeBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#0077b6" : "transparent",
        color: active ? "white" : "rgba(255,255,255,0.6)",
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function QuestionCard({
  q,
  index,
  active,
  lang,
  onClick,
  onDuplicate,
  onDelete,
}: {
  q: QuestionDraft;
  index: number;
  active: boolean;
  lang: string;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        margin: "0 8px 4px",
        borderRadius: 12,
        cursor: "pointer",
        border: active
          ? "2px solid #0077b6"
          : "2px solid transparent",
        background: active
          ? "rgba(255,255,255,0.1)"
          : hovered
          ? "rgba(255,255,255,0.08)"
          : "rgba(255,255,255,0.05)",
        minHeight: 72,
        padding: "10px 12px",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
        {index + 1}
      </div>
      <div
        style={{
          color: "white",
          fontSize: 12,
          fontWeight: 500,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {q.text || (lang === "uz" ? "Savol..." : "Вопрос...")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          marginTop: 8,
        }}
      >
        {["#e74c3c", "#2980b9", "#f39c12", "#27ae60"].map((color, ai) => (
          <div
            key={ai}
            style={{
              background: color + "99",
              borderRadius: 4,
              padding: "2px 4px",
              fontSize: 9,
              color: "white",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {q.answers[ai]?.text || "..."}
          </div>
        ))}
      </div>

      {/* Hover actions */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            display: "flex",
            gap: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onDuplicate}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "rgba(255,255,255,0.15)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.7)" }} />
          </button>
          <button
            onClick={onDelete}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "rgba(239,68,68,0.25)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 className="h-3 w-3" style={{ color: "#f87171" }} />
          </button>
        </div>
      )}
    </div>
  );
}

function AnswerCard({
  color,
  answer,
  answerIndex,
  lang,
  onChange,
  onSetCorrect,
}: {
  color: { bg: string; icon: string };
  answer: AnswerDraft;
  answerIndex: number;
  lang: string;
  onChange: (v: string) => void;
  onSetCorrect: () => void;
}) {
  return (
    <div
      style={{
        background: color.bg,
        borderRadius: 16,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 72,
      }}
    >
      <span style={{ color: "white", fontSize: 20, opacity: 0.8, flexShrink: 0 }}>
        {color.icon}
      </span>
      <input
        value={answer?.text ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          lang === "uz" ? `${answerIndex + 1}-javob...` : `Ответ ${answerIndex + 1}...`
        }
        autoComplete="off"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "white",
          fontWeight: 500,
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
      <button
        onClick={onSetCorrect}
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: answer?.isCorrect ? "2px solid white" : "2px solid rgba(255,255,255,0.6)",
          background: answer?.isCorrect ? "white" : "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {answer?.isCorrect && (
          <Check className="h-4 w-4" style={{ color: "#16a34a" }} />
        )}
      </button>
    </div>
  );
}
