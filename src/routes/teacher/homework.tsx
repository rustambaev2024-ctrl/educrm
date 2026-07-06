import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, BookOpen, Calendar, Users, ChevronRight, Star, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate, initialsOf } from "@/lib/format";
import type { Homework, HomeworkSubmission } from "@/lib/data/types";

export const Route = createFileRoute("/teacher/homework")({ component: TeacherHomework });

function dueState(dueIso: string): { tone: string; key: "overdue" | "dueToday" | "dueIn"; days: number } {
  const now = new Date();
  const due = new Date(dueIso);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { tone: "bg-destructive/10 text-destructive", key: "overdue", days: -diff };
  if (diff === 0) return { tone: "bg-warning/15 text-warning", key: "dueToday", days: 0 };
  return { tone: "bg-success/10 text-success", key: "dueIn", days: diff };
}

function TeacherHomework() {
  const { t, lang } = useI18n();
  const teacherId = useCurrentTeacherId();
  const { groups, homework, submissions, students, addHomework, gradeSubmission, isLoading } = useData();

  const myGroups = useMemo(() => groups.filter((g) => g.teacherId === teacherId), [groups, teacherId]);
  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups]);
  const myHomework = useMemo(
    () => homework.filter((h) => myGroupIds.has(h.groupId)).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
    [homework, myGroupIds],
  );

  const groupById = useMemo(() => Object.fromEntries(myGroups.map((g) => [g.id, g])), [myGroups]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const now = Date.now();
  const active = myHomework.filter((h) => new Date(h.dueDate).getTime() >= now - 86400000 * 3);
  const archived = myHomework.filter((h) => new Date(h.dueDate).getTime() < now - 86400000 * 3);

  const kpis = useMemo(() => {
    const myHwIds = new Set(myHomework.map((h) => h.id));
    const submitted = submissions.filter((s) => myHwIds.has(s.homeworkId)).length;
    const overdue = myHomework.filter((h) => new Date(h.dueDate).getTime() < now).length;
    return { total: myHomework.length, submitted, overdue };
  }, [myHomework, submissions, now]);

  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Homework | null>(null);

  const [form, setForm] = useState({ title: "", description: "", groupId: "", dueDate: "" });

  const submit = () => {
    if (!form.title.trim() || !form.groupId || !form.dueDate || !teacherId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    addHomework({
      title: form.title.trim(),
      description: form.description.trim(),
      groupId: form.groupId,
      teacherId,
      dueDate: new Date(form.dueDate + "T23:59:00").toISOString(),
    });
    toast.success(t("hw.created"));
    setCreateOpen(false);
    setForm({ title: "", description: "", groupId: "", dueDate: "" });
  };

  if (isLoading) {
    return (
      <PageShell title={t("hw.title")} subtitle={t("hw.subtitle")}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 min-[360px]:gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <CardGridSkeleton count={4} className="lg:grid-cols-2" />
        </div>
      </PageShell>
    );
  }

  const renderList = (list: Homework[]) => {
    if (list.length === 0) {
      return (
        <Card className="shadow-elegant">
          <EmptyState
            icon={<BookOpen className="size-7" />}
            title={t("hw.empty")}
            description={lang === "uz" ? "Hozircha vazifalar yaratilmagan" : "Пока нет созданных заданий"}
            action={{ label: t("hw.add"), onClick: () => setCreateOpen(true) }}
          />
        </Card>
      );
    }
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((h) => {
          const grp = groupById[h.groupId];
          const subs = submissions.filter((s) => s.homeworkId === h.id);
          const done = subs.filter((s) => s.status !== "pending").length;
          const total = grp?.studentIds.length ?? subs.length;
          const due = dueState(h.dueDate);
          return (
            <Card key={h.id} className="cursor-pointer p-4 shadow-elegant transition-shadow hover:shadow-elegant-lg" onClick={() => setReviewing(h)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{grp?.name ?? "—"}</Badge>
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${due.tone}`}>
                      <Calendar className="size-3" />
                      {due.key === "dueIn"
                        ? t("hw.dueIn").replace("{n}", String(due.days))
                        : due.key === "dueToday"
                          ? t("hw.dueToday")
                          : `${t("hw.overdue")} (${due.days}d)`}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{h.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{h.description}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {t("hw.progress").replace("{done}", String(done)).replace("{total}", String(total))}</span>
                <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> {formatDate(h.dueDate, lang)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-gradient-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <PageShell
      title={t("hw.title")}
      subtitle={t("hw.subtitle")}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" /> {t("hw.add")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 min-[360px]:gap-3">
          <KpiCard label={lang === "uz" ? "Jami vazifalar" : "Всего заданий"} value={kpis.total} icon={BookOpen} iconColor="blue" />
          <KpiCard label={lang === "uz" ? "Topshirilgan" : "Сдано"} value={kpis.submitted} icon={CheckCircle2} iconColor="green" />
          <KpiCard label={lang === "uz" ? "Muddati o'tgan" : "Просрочено"} value={kpis.overdue} icon={AlertCircle} iconColor="red" />
        </div>
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">{t("hw.tab.active")} ({active.length})</TabsTrigger>
            <TabsTrigger value="archived">{t("hw.tab.archived")} ({archived.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">{renderList(active)}</TabsContent>
          <TabsContent value="archived" className="mt-4">{renderList(archived)}</TabsContent>
        </Tabs>
      </div>

      {/* Create dialog */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("hw.add")}</SheetTitle>
            <SheetDescription>{t("hw.subtitle")}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <Label>{t("hw.field.group")}*</Label>
              <Select value={form.groupId} onValueChange={(v) => setForm({ ...form, groupId: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {myGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.title")}*</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.description")}</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.due")}*</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={submit}>{t("common.create")}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Review */}
      <Sheet open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {reviewing && (
            <ReviewPanel
              homework={reviewing}
              submissions={submissions.filter((s) => s.homeworkId === reviewing.id)}
              groupStudentIds={groupById[reviewing.groupId]?.studentIds ?? []}
              studentById={studentById}
              onGrade={(studentId, grade, feedback) => {
                gradeSubmission(reviewing.id, studentId, grade, feedback);
                toast.success(t("hw.gradeSaved"));
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function ReviewPanel({
  homework,
  submissions,
  groupStudentIds,
  studentById,
  onGrade,
}: {
  homework: Homework;
  submissions: HomeworkSubmission[];
  groupStudentIds: string[];
  studentById: Record<string, { fullName: string }>;
  onGrade: (studentId: string, grade: number, feedback?: string) => void;
}) {
  const { t, lang } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const subByStudent = useMemo(() => Object.fromEntries(submissions.map((s) => [s.studentId, s])), [submissions]);
  const ids = groupStudentIds.length ? groupStudentIds : submissions.map((s) => s.studentId);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{homework.title}</SheetTitle>
        <SheetDescription>{formatDate(homework.dueDate, lang)} · {t("hw.dueLabel")}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <Card className="p-3 shadow-elegant">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{homework.description || "—"}</p>
        </Card>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("hw.submissions")}</div>
        {ids.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{t("hw.noStudents")}</div>}
        <div className="space-y-2">
          {ids.map((sid) => {
            const s = studentById[sid];
            const sub = subByStudent[sid];
            const status = sub?.status ?? "pending";
            const draft = drafts[sid] ?? { score: sub?.grade?.toString() ?? "", feedback: sub?.feedback ?? "" };
            const tone =
              status === "graded" ? "bg-success/15 text-success"
                : status === "submitted" ? "bg-info/15 text-info"
                  : status === "late" ? "bg-warning/15 text-warning"
                    : "bg-muted text-muted-foreground";
            return (
              <Card key={sid} className="p-3 shadow-elegant">
                <div className="flex items-center gap-3">
                  <Avatar className="size-9"><AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">{initialsOf(s?.fullName ?? "?")}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s?.fullName ?? sid}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {sub?.submittedAt ? formatDate(sub.submittedAt, lang) : "—"}
                    </div>
                  </div>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{t(`subst.${status}`)}</span>
                </div>
                {(status === "submitted" || status === "late" || status === "graded") && (
                  <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[11px]">{t("hw.grade")} (0-10)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          value={draft.score}
                          onChange={(e) => setDrafts({ ...drafts, [sid]: { ...draft, score: e.target.value } })}
                          className="h-9"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const n = Number(draft.score);
                          if (Number.isNaN(n) || n < 0 || n > 10) return;
                          onGrade(sid, n, draft.feedback || undefined);
                        }}
                      >
                        <Star className="mr-1 size-3.5" /> {t("common.save")}
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder={t("hw.feedback")}
                      value={draft.feedback}
                      onChange={(e) => setDrafts({ ...drafts, [sid]: { ...draft, feedback: e.target.value } })}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
