import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Calendar, CheckCircle2, Clock, Send, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentStudentId } from "@/lib/data/identity";
import { formatDate } from "@/lib/format";
import type { Homework } from "@/lib/data/types";

export const Route = createFileRoute("/student/homework")({ component: StudentHomeworkPage });

function dueState(dueIso: string) {
  const now = new Date();
  const due = new Date(dueIso);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { tone: "bg-destructive/10 text-destructive", label: "overdue" as const, days: -diff };
  if (diff === 0) return { tone: "bg-warning/15 text-warning", label: "today" as const, days: 0 };
  return { tone: "bg-success/10 text-success", label: "upcoming" as const, days: diff };
}

function StudentHomeworkPage() {
  const { t, lang } = useI18n();
  const studentId = useCurrentStudentId();
  const { homework, submissions, groups, staff, updateSubmission, isLoading } = useData();

  const myGroups = useMemo(
    () => (studentId ? groups.filter((g) => g.studentIds.includes(studentId)) : []),
    [groups, studentId],
  );
  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  const myHomework = useMemo(
    () => homework.filter((h) => myGroupIds.has(h.groupId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [homework, myGroupIds],
  );

  const subByHw = useMemo(() => {
    const map: Record<string, ReturnType<typeof submissions.find>> = {};
    if (!studentId) return map;
    for (const s of submissions) if (s.studentId === studentId) map[s.homeworkId] = s;
    return map;
  }, [submissions, studentId]);

  const todo = myHomework.filter((h) => {
    const s = subByHw[h.id];
    return !s || s.status === "pending";
  });
  const done = myHomework.filter((h) => {
    const s = subByHw[h.id];
    return s && s.status !== "pending";
  });

  const [active, setActive] = useState<Homework | null>(null);
  const [comment, setComment] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const submit = () => {
    if (!active || !studentId) return;
    const due = new Date(active.dueDate).getTime();
    const status: "submitted" | "late" = Date.now() > due ? "late" : "submitted";
    updateSubmission(active.id, studentId, {
      status,
      submittedAt: new Date().toISOString(),
      comment: comment.trim() || undefined,
    });
    toast.success(t("shw.submitted"));
    setActive(null);
    setComment("");
  };

  const renderCard = (h: Homework) => {
    const due = dueState(h.dueDate);
    const sub = subByHw[h.id];
    const grp = groupById[h.groupId];
    const tch = teacherById[h.teacherId];
    return (
      <Card
        key={h.id}
        className="cursor-pointer p-4 shadow-elegant transition-all active:scale-[0.99]"
        onClick={() => { setActive(h); setComment(""); }}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{grp?.name}</Badge>
          <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${due.tone}`}>
            {due.label === "overdue" ? `${t("hw.overdue")} ${due.days}${lang === "uz" ? " kun" : " дн."}` : due.label === "today" ? t("hw.dueToday") : t("hw.dueIn").replace("{n}", String(due.days))}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-semibold">{h.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.description}</p>
        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar className="size-3" /> {formatDate(h.dueDate, lang)}</span>
          <span className="truncate">{tch?.fullName}</span>
        </div>
        {sub && sub.status === "graded" && sub.grade !== undefined && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success">
            <Star className="size-3.5" /> {sub.grade}/10
          </div>
        )}
        {sub && sub.status === "submitted" && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-info/10 px-2 py-1 text-xs font-semibold text-info">
            <CheckCircle2 className="size-3.5" /> {t("subst.submitted")}
          </div>
        )}
        {sub && sub.status === "late" && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
            <Clock className="size-3.5" /> {t("subst.late")}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <div>
        <h1 className="text-2xl font-bold">{t("shw.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todo.length} {t("hw.assigned")} · {done.length} {t("subst.submitted")}</p>
      </div>

      <Tabs defaultValue="todo">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="todo">{t("shw.tab.todo")} ({todo.length})</TabsTrigger>
          <TabsTrigger value="done">{t("shw.tab.done")} ({done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="todo" className="mt-3 space-y-3">
          {todo.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-10 text-center shadow-elegant">
              <CheckCircle2 className="size-8 text-success" />
              <div className="text-sm font-semibold">{t("shw.empty")}</div>
            </Card>
          ) : (
            todo.map(renderCard)
          )}
        </TabsContent>
        <TabsContent value="done" className="mt-3 space-y-3">
          {done.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-10 text-center shadow-elegant">
              <BookOpen className="size-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">{t("shw.empty")}</div>
            </Card>
          ) : (
            done.map(renderCard)
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          {active && (() => {
            const sub = subByHw[active.id];
            const grp = groupById[active.groupId];
            const tch = teacherById[active.teacherId];
            const isOpen = !sub || sub.status === "pending";
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{active.title}</SheetTitle>
                  <SheetDescription>{grp?.name} · {tch?.fullName}</SheetDescription>
                </SheetHeader>
                <div className="space-y-4 px-4 pb-6">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-accent px-2 py-1 font-semibold text-primary">
                      <Calendar className="mr-1 inline size-3" /> {formatDate(active.dueDate, lang)}
                    </span>
                  </div>
                  <Card className="p-3 shadow-elegant">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{active.description}</p>
                  </Card>

                  {sub && sub.status === "graded" && (
                    <Card className="space-y-2 bg-success/5 p-3 shadow-elegant">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("shw.score")}</span>
                        <span className="rounded-md bg-success px-2 py-0.5 text-sm font-bold text-success-foreground">{sub.grade}/10</span>
                      </div>
                      {sub.feedback && (
                        <div className="border-t border-border/60 pt-2">
                          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <MessageSquare className="size-3" /> {t("shw.viewFeedback")}
                          </div>
                          <p className="text-sm">{sub.feedback}</p>
                        </div>
                      )}
                    </Card>
                  )}

                  {(sub?.status === "submitted" || sub?.status === "late") && (
                    <Card className="bg-info/5 p-3 shadow-elegant">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-info" />
                        <span className="font-semibold">{t("shw.submitted")}</span>
                        <span className="text-muted-foreground">· {sub.submittedAt && formatDate(sub.submittedAt, lang)}</span>
                      </div>
                    </Card>
                  )}

                  {isOpen && (
                    <div className="space-y-2">
                      <Textarea
                        rows={3}
                        placeholder={t("shw.commentPlaceholder")}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <Button className="w-full" onClick={submit}>
                        <Send className="mr-1 size-4" /> {t("shw.submit")}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
