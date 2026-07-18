import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trophy, Check, X } from "lucide-react";
import { getTenantSchema } from "@/lib/api";
import { getWebSocketBaseUrl } from "@/lib/realtime";

export const Route = createFileRoute("/play/$code")({ component: PlayPage });

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

function PlayPage() {
  const { code } = useParams({ strict: false }) as { code: string };

  const lang = (typeof window !== "undefined" ? localStorage.getItem("lang") : null) || "uz";
  const uz = lang === "uz";

  const participantId =
    typeof window !== "undefined" ? sessionStorage.getItem(`quiz_participant_${code}`) : null;
  const myName =
    typeof window !== "undefined" ? sessionStorage.getItem(`quiz_name_${code}`) ?? "" : "";

  const [phase, setPhase] = useState<"waiting" | "active" | "answered" | "finished">("waiting");
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [results, setResults] = useState<WsResult[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Guard — участник не прошёл join
  if (!participantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1b2a]">
        <div className="space-y-4 text-center">
          <div className="text-lg font-semibold text-white">
            {uz
              ? "Sessiyaga ulanish uchun avval kodni kiriting"
              : "Для входа в сессию сначала введите код"}
          </div>
          <a
            href="/join"
            className="inline-block rounded-xl bg-[#0077b6] px-6 py-3 font-semibold text-white"
          >
            {uz ? "Kodni kiriting" : "Ввести код"}
          </a>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const schema = getTenantSchema();
      const url = `${getWebSocketBaseUrl()}/ws/quiz/${code}/${schema ? `?schema=${encodeURIComponent(schema)}` : ""}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Record<string, unknown>;

        if (data.type === "question") {
          setQuestion(data.question as WsQuestion);
          setChosen(null);
          setIsCorrect(null);
          setPhase("active");
        } else if (data.type === "answer_result") {
          // БАГ 4: личный результат — только этому участнику
          setIsCorrect(Boolean(data.is_correct));
          setMyScore(Number(data.score));
        } else if (data.type === "finished") {
          setResults(data.results as WsResult[]);
          setPhase("finished");
        } else if (data.type === "host_disconnected") {
          // Хост временно отключился (сеть моргнула, обновил вкладку) — он
          // переподключится сам, сессия не завершена. Раньше это мгновенно
          // и необратимо заканчивало тест для всех участников.
          toast.warning(
            uz
              ? "O'qituvchi bilan aloqa uzildi, kutib turing..."
              : "Связь с учителем прервалась, подождите..."
          );
        }
      };

      socket.onclose = (event) => {
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
    };
  }, [code, participantId]);

  const answer = (answerId: string) => {
    if (chosen || !question || !participantId) return;
    setChosen(answerId);
    setPhase("answered");
    socketRef.current?.send(
      JSON.stringify({
        type: "participant_answer",
        participant_id: participantId,
        question_id: question.id,
        answer_id: answerId,
      })
    );
  };

  // ─── WAITING ────────────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-white">
        <Loader2 className="size-10 animate-spin text-[#0077b6]" />
        <div className="text-lg font-medium">
          {uz ? "Test boshlanishini kuting..." : "Ожидайте начала теста..."}
        </div>
        {myName && <div className="text-white/50">{myName}</div>}
      </div>
    );
  }

  // ─── ACTIVE / ANSWERED ──────────────────────────────────────────────────────
  if ((phase === "active" || phase === "answered") && question) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-900 p-4 text-white">
        <div className="flex flex-1 items-center justify-center py-6">
          <h2 className="max-w-2xl text-center text-2xl font-bold">{question.text}</h2>
        </div>

        {phase === "answered" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {isCorrect === null ? (
              <Loader2 className="size-12 animate-spin text-white/60" />
            ) : isCorrect ? (
              <div className="flex flex-col items-center gap-3 text-emerald-400">
                <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="size-10" />
                </div>
                <div className="text-xl font-bold">{uz ? "To'g'ri!" : "Правильно!"}</div>
                <div className="text-white/60">{myScore} {uz ? "ball" : "очков"}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-red-400">
                <div className="flex size-20 items-center justify-center rounded-full bg-red-500/20">
                  <X className="size-10" />
                </div>
                <div className="text-xl font-bold">{uz ? "Noto'g'ri" : "Неверно"}</div>
              </div>
            )}
            <div className="text-white/50">
              {uz ? "Keyingi savolni kuting..." : "Ожидайте следующий вопрос..."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.answers.map((a, i) => (
              <button
                key={a.id}
                onClick={() => answer(a.id)}
                disabled={!!chosen}
                className={`flex items-center gap-3 rounded-xl p-6 text-left text-lg font-semibold transition-all ${ANSWER_COLORS[i % 4]} ${chosen && chosen !== a.id ? "opacity-40" : ""}`}
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-white/20 text-base">
                  {i + 1}
                </span>
                {a.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── FINISHED ───────────────────────────────────────────────────────────────
  const me = results.find((r) => r.participant_id === participantId);
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-slate-900 p-6 text-white">
      <div className="mt-8 flex flex-col items-center gap-3">
        <Trophy className="size-14 text-amber-400" />
        {me ? (
          <>
            <div className="text-6xl font-bold tabular-nums">{me.rank ?? "—"}</div>
            <div className="text-white/60">
              {me.rank === 1 ? (uz ? "1-o'rin!" : "1-е место!") : uz ? "o'rin" : "место"}
            </div>
            <div className="mt-2 rounded-xl bg-white/10 px-6 py-3 text-2xl font-bold tabular-nums">
              {me.score} {uz ? "ball" : "очков"}
            </div>
          </>
        ) : (
          <div className="text-xl">{uz ? "Test yakunlandi" : "Тест завершён"}</div>
        )}
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-2 text-center text-sm text-white/40">
          {uz ? "Barcha ishtirokchilar" : "Все участники"}
        </div>
        <div className="divide-y divide-white/10 overflow-hidden rounded-xl bg-white/5">
          {results.slice(0, 10).map((r, i) => (
            <div
              key={r.participant_id}
              className={`flex items-center gap-3 p-3 ${r.participant_id === participantId ? "bg-[#0077b6]/15" : ""}`}
            >
              <span className="w-6 text-center text-sm font-bold tabular-nums">
                {r.rank ?? i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
              <span className="font-mono text-sm font-bold tabular-nums">{r.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
