import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiErrorText } from "@/lib/api-error";
import { Play, ArrowRight, Trophy, Users, RotateCcw, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { quizApi, readAccessToken, getTenantSchema } from "@/lib/api";
import { getWebSocketBaseUrl } from "@/lib/realtime";
import { useI18n } from "@/lib/i18n";
import type { QuizSessionRow } from "@/routes/admin/quizzes";

interface WsAnswer {
  id: string;
  text: string;
}
interface WsQuestion {
  id: string;
  text: string;
  time_limit: number;
  answers: WsAnswer[];
}
interface WsResult {
  participant_id: string;
  name: string;
  score: number;
  rank: number | null;
}

const ANSWER_COLORS = [
  "bg-red-500 hover:bg-red-600",
  "bg-[#0077b6] hover:bg-[#006da8]",
  "bg-emerald-500 hover:bg-emerald-600",
  "bg-amber-500 hover:bg-amber-600",
];

export function QuizSessionPage({ basePath }: { basePath: "/admin" | "/teacher" }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };

  const [session, setSession] = useState<QuizSessionRow | null>(null);
  const [phase, setPhase] = useState<"waiting" | "active" | "finished">("waiting");
  const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qTotal, setQTotal] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [results, setResults] = useState<WsResult[]>([]);
  const [restoringQuestion, setRestoringQuestion] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Load session meta via REST. При монтировании (в т.ч. после F5) фронт не
  // видел WS-события, которые уже прошли ДО перезагрузки — если сервер
  // говорит status="active", нужно ещё явно восстановить текущий вопрос
  // (BUG-048), иначе рендер молча проваливается в экран "Тест завершён".
  useEffect(() => {
    quizApi.sessions
      .get(sessionId)
      .then(async (s) => {
        const row = s as QuizSessionRow;
        setSession(row);
        setPhase(row.status);
        setParticipants(row.participants.map((p) => ({ id: p.id, name: p.name })));

        if (row.status === "active") {
          setRestoringQuestion(true);
          try {
            const state = (await quizApi.sessions.state(sessionId)) as {
              status: "waiting" | "active" | "finished";
              current_question_index: number;
              total_questions: number;
              question: WsQuestion | null;
            };
            if (state.status === "active" && state.question) {
              setQuestion(state.question);
              setQIndex(state.current_question_index);
              setQTotal(state.total_questions);
              // Точное оставшееся время сервер не хранит — начинаем отсчёт
              // заново с полного лимита вопроса, это лучше, чем ложный
              // "тест завершён" сразу после перезагрузки.
              startTimer(state.question.time_limit);
            } else if (state.status === "finished") {
              setPhase("finished");
            }
          } catch {
            // не удалось восстановить вопрос — оставляем спиннер убранным,
            // ниже сработает fallback на экран ожидания следующего события
          } finally {
            setRestoringQuestion(false);
          }
        }
      })
      .catch(() => {
        toast.error(tr("Sessiyani yuklab bo'lmadi", "Не удалось загрузить сессию"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Countdown timer
  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(seconds);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  // Connect WebSocket once session code is known. Обрыв связи (сеть моргнула,
  // случайно обновилась вкладка) на живой демонстрации не должен требовать
  // ручных действий — переподключаемся сами, пока сессия не завершена.
  useEffect(() => {
    if (!session?.code) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const token = readAccessToken();
      const url = `${getWebSocketBaseUrl()}/ws/quiz/${session.code}/${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => setWsConnected(true);

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Record<string, unknown>;

        if (data.type === "question") {
          setPhase("active");
          setQuestion(data.question as WsQuestion);
          setQIndex(Number(data.index));
          setQTotal(Number(data.total));
          setAnsweredCount(0);
          startTimer((data.question as WsQuestion).time_limit);
        } else if (data.type === "answer_count_update") {
          // БАГ 4: анонимный счётчик ответов вместо answer_received
          setAnsweredCount(Number(data.answered));
          setTotalParticipants(Number(data.total));
        } else if (data.type === "finished") {
          setPhase("finished");
          setResults(data.results as WsResult[]);
          if (timerRef.current) clearInterval(timerRef.current);
        } else if (data.type === "error") {
          // БАГ 3: тест без вопросов
          if ((data.message as string) === "no_questions") {
            toast.error(
              tr(
                "Testda savollar yo'q! Avval savol qo'shing.",
                "В тесте нет вопросов! Сначала добавьте вопросы."
              )
            );
          }
        }
      };

      socket.onclose = (event) => {
        setWsConnected(false);
        if (cancelled || event.code === 1000) return;
        if (phaseRef.current === "finished") return;
        reconnectTimerRef.current = setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close(1000);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.code, startTimer]);

  // Poll participant list while waiting
  useEffect(() => {
    if (phase !== "waiting" || !sessionId) return;
    const interval = setInterval(() => {
      quizApi.sessions
        .get(sessionId)
        .then((s) =>
          setParticipants((s as QuizSessionRow).participants.map((p) => ({ id: p.id, name: p.name })))
        )
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, sessionId]);

  const send = (payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      // Раньше клик молча пропадал, если сокет ещё не открыт (CONNECTING
      // сразу после монтирования/переподключения) — приходилось жать
      // повторно без объяснения причины.
      toast.error(tr("Ulanish kutilmoqda, birozdan so'ng qayta urinib ko'ring", "Ожидание соединения, попробуйте ещё раз через момент"));
    }
  };

  const startQuiz = () => send({ type: "host_start" });
  const nextQuestion = () => send({ type: "host_next" });

  const newSession = async () => {
    if (!session) return;
    try {
      const fresh = (await quizApi.createSession(session.quiz)) as QuizSessionRow;
      navigate({ to: `${basePath}/quiz-session/${fresh.id}` as string });
      window.location.reload();
    } catch (err) {
      toast.error(apiErrorText(err, lang, tr("Xatolik", "Ошибка")));
    }
  };

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── WAITING ────────────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 p-6 text-white">
        <div className="text-center">
          <div className="text-sm uppercase tracking-widest text-white/50">{session.quiz_title}</div>
          <div className="mt-4 font-mono text-7xl font-bold tracking-[0.2em] tabular-nums">
            {session.code}
          </div>
          <div className="mt-3 text-white/60">
            {tr("Kodni kiriting", "Введите код")}:{" "}
            {typeof window !== "undefined"
              ? `${window.location.origin}/join?schema=${encodeURIComponent(getTenantSchema())}`
              : "/join"}
          </div>
        </div>

        <div className="w-full max-w-3xl">
          <div className="mb-3 flex items-center justify-center gap-2 text-white/70">
            <Users className="size-4" /> {participants.length} {tr("ishtirokchi", "участников")}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {participants.map((p) => (
              <span key={p.id} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-medium">
                {p.name}
                <button
                  className="ml-1 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-white/20"
                  onClick={async () => {
                    if (!session) return;
                    try {
                      await quizApi.sessions.kickParticipant(session.id, p.id);
                      setParticipants((prev) => prev.filter((x) => x.id !== p.id));
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {participants.length === 0 && (
              <span className="text-white/40">
                {tr("Ishtirokchilarni kutmoqda...", "Ожидание участников...")}
              </span>
            )}
          </div>
        </div>

        <Button
          size="lg"
          className="gap-2 bg-emerald-600 px-8 text-lg hover:bg-emerald-700"
          disabled={participants.length === 0 || !wsConnected}
          onClick={startQuiz}
        >
          <Play className="size-5" /> {wsConnected ? tr("Testni boshlash", "Начать тест") : tr("Ulanmoqda...", "Подключение...")}
        </Button>
      </div>
    );
  }

  // ─── ACTIVE (question) ──────────────────────────────────────────────────────
  if (phase === "active" && question) {
    const danger = secondsLeft <= 5;
    const displayAnswered = totalParticipants > 0 ? answeredCount : answeredCount;
    return (
      <div className="flex min-h-screen flex-col bg-slate-900 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
            {qIndex + 1}/{qTotal} {tr("savol", "вопрос")}
          </div>
          <div
            className={`font-mono text-5xl font-bold tabular-nums ${danger ? "animate-pulse text-red-500" : ""}`}
          >
            {secondsLeft}
          </div>
          <div className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
            {displayAnswered}
            {totalParticipants > 0 ? `/${totalParticipants}` : ""} {tr("javob berdi", "ответили")}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <h2 className="max-w-4xl text-center text-3xl font-bold sm:text-4xl">{question.text}</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.answers.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 rounded-xl p-5 text-lg font-semibold ${ANSWER_COLORS[i % 4]}`}
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-white/20 text-base">
                {i + 1}
              </span>
              {a.text}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Button size="lg" className="gap-2 px-8" disabled={!wsConnected} onClick={nextQuestion}>
            {!wsConnected
              ? tr("Ulanmoqda...", "Подключение...")
              : qIndex + 1 >= qTotal ? tr("Yakunlash", "Завершить") : tr("Keyingi savol", "Следующий вопрос")}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── ACTIVE, но вопрос ещё не восстановлен (после F5/переподключения) ────────
  // Раньше это молча проваливалось в блок "Test yakunlandi!" ниже (BUG-048),
  // потому что там не было своего условия — просто дефолтный рендер.
  if (phase === "active" && !question) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-white">
        <Loader2 className="size-10 animate-spin text-white/60" />
        <div className="text-white/60">
          {restoringQuestion
            ? tr("Savol tiklanmoqda...", "Восстанавливаем текущий вопрос...")
            : tr("Kutilmoqda...", "Ожидание...")}
        </div>
      </div>
    );
  }

  // ─── FINISHED (results) ─────────────────────────────────────────────────────
  if (phase !== "finished") return null;
  const top = results.slice(0, 10);
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-slate-900 p-6 text-white">
      <div className="mt-6 flex flex-col items-center gap-2">
        <Trophy className="size-12 text-amber-400" />
        <h1 className="text-3xl font-bold">{tr("Test yakunlandi!", "Тест завершён!")}</h1>
      </div>

      <Card className="w-full max-w-xl overflow-hidden border-white/10 bg-white/5 text-white">
        {top.length === 0 ? (
          <div className="p-8 text-center text-white/50">{tr("Natijalar yo'q", "Нет результатов")}</div>
        ) : (
          <div className="divide-y divide-white/10">
            {top.map((r, i) => (
              <div key={r.participant_id} className="flex items-center gap-4 p-4">
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                    i === 0
                      ? "bg-amber-400 text-slate-900"
                      : i === 1
                      ? "bg-slate-300 text-slate-900"
                      : i === 2
                      ? "bg-amber-700 text-white"
                      : "bg-white/10"
                  }`}
                >
                  {r.rank ?? i + 1}
                </span>
                <span className="flex-1 font-medium">{r.name}</span>
                <span className="font-mono text-lg font-bold tabular-nums">{r.score}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10"
          onClick={() => navigate({ to: `${basePath}/quizzes` as string })}
        >
          {tr("Testlarga qaytish", "К тестам")}
        </Button>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={newSession}>
          <RotateCcw className="size-4" /> {tr("Yangi sessiya", "Новая сессия")}
        </Button>
      </div>
    </div>
  );
}
