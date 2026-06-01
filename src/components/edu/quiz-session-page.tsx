import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, ArrowRight, Trophy, Users, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { quizApi, readAccessToken } from "@/lib/api";
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
  "bg-blue-500 hover:bg-blue-600",
  "bg-emerald-500 hover:bg-emerald-600",
  "bg-amber-500 hover:bg-amber-600",
];

export function QuizSessionPage({ basePath }: { basePath: "/admin" | "/teacher" }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  // Route is `${basePath}/quiz-session/$sessionId`
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };

  const [session, setSession] = useState<QuizSessionRow | null>(null);
  const [phase, setPhase] = useState<"waiting" | "active" | "finished">("waiting");
  const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qTotal, setQTotal] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [results, setResults] = useState<WsResult[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load session meta (code, participants, quiz title) via REST
  useEffect(() => {
    quizApi.sessions
      .get(sessionId)
      .then((s) => {
        const row = s as QuizSessionRow;
        setSession(row);
        setPhase(row.status);
        setParticipants(row.participants.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch((err) => {
        console.error("[quiz-session] load failed", err);
        toast.error(tr("Sessiyani yuklab bo'lmadi", "Не удалось загрузить сессию"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Countdown
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

  // Connect WS once we know the code (host uses token auth)
  useEffect(() => {
    if (!session?.code) return;
    const token = readAccessToken();
    const url = `${getWebSocketBaseUrl()}/ws/quiz/${session.code}/${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "question") {
        setPhase("active");
        setQuestion(data.question as WsQuestion);
        setQIndex(data.index);
        setQTotal(data.total);
        setAnsweredCount(0);
        startTimer((data.question as WsQuestion).time_limit);
      } else if (data.type === "answer_received") {
        setAnsweredCount((c) => c + 1);
      } else if (data.type === "finished") {
        setPhase("finished");
        setResults(data.results as WsResult[]);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    return () => {
      socket.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.code, startTimer]);

  // Poll participant list while waiting (no WS event for joins in spec)
  useEffect(() => {
    if (phase !== "waiting" || !sessionId) return;
    const interval = setInterval(() => {
      quizApi.sessions
        .get(sessionId)
        .then((s) => setParticipants((s as QuizSessionRow).participants.map((p) => ({ id: p.id, name: p.name }))))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, sessionId]);

  const send = (payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  const startQuiz = () => send({ type: "host_start" });
  const nextQuestion = () => send({ type: "host_next" });

  const newSession = async () => {
    if (!session) return;
    try {
      const fresh = (await quizApi.createSession(session.quiz)) as QuizSessionRow;
      navigate({ to: `${basePath}/quiz-session/${fresh.id}` as string });
      // hard reload to reset all WS/timer state
      window.location.reload();
    } catch {
      toast.error(tr("Xatolik", "Ошибка"));
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
          <div className="mt-4 font-mono text-7xl font-bold tracking-[0.2em] tabular-nums">{session.code}</div>
          <div className="mt-3 text-white/60">
            {tr("Kodni kiriting", "Введите код")}: {typeof window !== "undefined" ? window.location.origin : ""}/join
          </div>
        </div>

        <div className="w-full max-w-3xl">
          <div className="mb-3 flex items-center justify-center gap-2 text-white/70">
            <Users className="size-4" /> {participants.length} {tr("ishtirokchi", "участников")}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {participants.map((p) => (
              <span key={p.id} className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium">
                {p.name}
              </span>
            ))}
            {participants.length === 0 && (
              <span className="text-white/40">{tr("Ishtirokchilarni kutmoqda...", "Ожидание участников...")}</span>
            )}
          </div>
        </div>

        <Button
          size="lg"
          className="gap-2 bg-emerald-600 px-8 text-lg hover:bg-emerald-700"
          disabled={participants.length === 0}
          onClick={startQuiz}
        >
          <Play className="size-5" /> {tr("Testni boshlash", "Начать тест")}
        </Button>
      </div>
    );
  }

  // ─── ACTIVE (question) ──────────────────────────────────────────────────────
  if (phase === "active" && question) {
    const danger = secondsLeft <= 5;
    return (
      <div className="flex min-h-screen flex-col bg-slate-900 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
            {qIndex + 1}/{qTotal} {tr("savol", "вопрос")}
          </div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${danger ? "animate-pulse text-red-500" : ""}`}>
            {secondsLeft}
          </div>
          <div className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
            {answeredCount} {tr("javob berdi", "ответили")}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <h2 className="max-w-4xl text-center text-3xl font-bold sm:text-4xl">{question.text}</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.answers.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-3 rounded-xl p-5 text-lg font-semibold ${ANSWER_COLORS[i % 4]}`}>
              <span className="flex size-8 items-center justify-center rounded-md bg-white/20 text-base">{i + 1}</span>
              {a.text}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Button size="lg" className="gap-2 px-8" onClick={nextQuestion}>
            {qIndex + 1 >= qTotal ? tr("Yakunlash", "Завершить") : tr("Keyingi savol", "Следующий вопрос")}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── FINISHED (results) ─────────────────────────────────────────────────────
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
                    i === 0 ? "bg-amber-400 text-slate-900" : i === 1 ? "bg-slate-300 text-slate-900" : i === 2 ? "bg-amber-700 text-white" : "bg-white/10"
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
        <Button variant="outline" className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => navigate({ to: `${basePath}/quizzes` as string })}>
          {tr("Testlarga qaytish", "К тестам")}
        </Button>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={newSession}>
          <RotateCcw className="size-4" /> {tr("Yangi sessiya", "Новая сессия")}
        </Button>
      </div>
    </div>
  );
}
