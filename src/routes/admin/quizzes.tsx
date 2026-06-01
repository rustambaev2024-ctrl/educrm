import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, Play, Pencil, Users, Layers } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quizApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/quizzes")({ component: () => <QuizzesPage basePath="/admin" /> });

export interface QuizParticipant {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  parent_name: string;
  parent_phone: string;
  score: number;
  rank: number | null;
  joined_at: string;
}

export interface QuizSessionRow {
  id: string;
  code: string;
  status: "waiting" | "active" | "finished";
  quiz: string;
  quiz_title: string;
  quiz_type: "student" | "lead";
  host: string;
  host_name: string;
  current_question_index: number;
  participants_count: number;
  participants: QuizParticipant[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface QuizRow {
  id: string;
  title: string;
  description: string;
  quiz_type: "student" | "lead";
  created_by_name: string;
  questions_count: number;
  sessions_count: number;
  created_at: string;
}

function toResults<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export function QuizzesPage({ basePath }: { basePath: "/admin" | "/teacher" }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const [tab, setTab] = useState<"quizzes" | "sessions">("quizzes");
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [sessions, setSessions] = useState<QuizSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<QuizSessionRow | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([quizApi.list(), quizApi.sessions.list()]);
      setQuizzes(toResults<QuizRow>(q));
      setSessions(toResults<QuizSessionRow>(s));
    } catch (err) {
      console.error("[quizzes] load failed", err);
      toast.error(tr("Yuklashda xatolik", "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = async (quizId: string) => {
    try {
      const session = (await quizApi.createSession(quizId)) as QuizSessionRow;
      navigate({ to: `${basePath}/quiz-session/${session.id}` as string });
    } catch (err) {
      console.error("[quizzes] start session failed", err);
      toast.error(tr("Sessiyani boshlab bo'lmadi", "Не удалось запустить сессию"));
    }
  };

  const statusBadge = (status: QuizSessionRow["status"]) => {
    const map = {
      waiting: { cls: "bg-amber-500/10 text-amber-600", label: tr("Kutilmoqda", "Ожидание") },
      active: { cls: "bg-emerald-500/10 text-emerald-600", label: tr("Faol", "Активна") },
      finished: { cls: "bg-muted text-muted-foreground", label: tr("Tugadi", "Завершена") },
    }[status];
    return <Badge variant="outline" className={map.cls}>{map.label}</Badge>;
  };

  return (
    <PageShell
      title={tr("Testlar", "Тесты")}
      subtitle={tr("Barcha testlar va sessiyalar", "Все тесты и сессии")}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={() => navigate({ to: `${basePath}/quiz-create` as string })}>
          <Plus className="size-3.5" /> {tr("Yangi test", "Новый тест")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="quizzes">{tr("Testlar", "Тесты")}</TabsTrigger>
            <TabsTrigger value="sessions">{tr("Sessiyalar", "Сессии")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : tab === "quizzes" ? (
          quizzes.length === 0 ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">{tr("Testlar yo'q", "Тестов нет")}</Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-[#e0f2fe] text-[#0077b6]">
                      <FileText className="size-4" />
                    </div>
                    <Badge variant="outline" className={quiz.quiz_type === "lead" ? "bg-violet-500/10 text-violet-600" : "bg-[#e0f2fe] text-[#0077b6]"}>
                      {quiz.quiz_type === "lead" ? tr("Lidlar", "Лиды") : tr("O'quvchilar", "Ученики")}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold leading-tight">{quiz.title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {quiz.created_by_name} · {formatDate(quiz.created_at, lang)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Layers className="size-3" /> {quiz.questions_count} {tr("savol", "вопр.")}</span>
                    <span className="flex items-center gap-1"><Play className="size-3" /> {quiz.sessions_count} {tr("sessiya", "сессий")}</span>
                  </div>
                  <div className="mt-auto flex gap-2 pt-1">
                    <Button size="sm" className="h-8 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => startSession(quiz.id)}>
                      <Play className="size-3.5" /> {tr("Boshlash", "Запустить")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => navigate({ to: `${basePath}/quiz-create?edit=${quiz.id}` as string })}>
                      <Pencil className="size-3.5" /> {tr("Tahrirlash", "Изменить")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : sessions.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">{tr("Sessiyalar yo'q", "Сессий нет")}</Card>
        ) : (
          <Card className="overflow-hidden shadow-elegant">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("Test", "Тест")}</TableHead>
                  <TableHead>{tr("Host", "Хост")}</TableHead>
                  <TableHead className="text-center">{tr("Ishtirokchilar", "Участники")}</TableHead>
                  <TableHead>{tr("Holat", "Статус")}</TableHead>
                  <TableHead>{tr("Sana", "Дата")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setSelectedSession(s)}>
                    <TableCell className="font-medium">{s.quiz_title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.host_name}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.participants_count}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(s.created_at, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <SessionDetailSheet session={selectedSession} onClose={() => setSelectedSession(null)} />
    </PageShell>
  );
}

function SessionDetailSheet({ session, onClose }: { session: QuizSessionRow | null; onClose: () => void }) {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const isLead = session?.quiz_type === "lead";

  const ranked = useMemo(
    () => (session ? [...session.participants].sort((a, b) => b.score - a.score) : []),
    [session],
  );

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{session?.quiz_title}</SheetTitle>
          <SheetDescription>
            {tr("Host", "Хост")}: {session?.host_name} · {tr("Kod", "Код")}: {session?.code}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5">
          {ranked.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">{tr("Ishtirokchilar yo'q", "Участников нет")}</Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{tr("Ism", "Имя")}</TableHead>
                    <TableHead>{tr("Telefon", "Телефон")}</TableHead>
                    {isLead && <TableHead>{tr("Tug'ilgan", "Дата рожд.")}</TableHead>}
                    {isLead && <TableHead>{tr("Ota-ona", "Родитель")}</TableHead>}
                    <TableHead className="text-right">{tr("Ball", "Очки")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold tabular-nums">{p.rank ?? i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.phone || "—"}</TableCell>
                      {isLead && <TableCell className="text-sm text-muted-foreground">{p.birth_date || "—"}</TableCell>}
                      {isLead && (
                        <TableCell className="text-sm text-muted-foreground">
                          {p.parent_name ? `${p.parent_name} · ${p.parent_phone}` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-semibold tabular-nums">{p.score}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
