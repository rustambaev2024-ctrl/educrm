import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, BookOpen, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { HomeworkList, ReviewPanel } from "@/components/edu/homework-review-panel";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { DateInput, todayIso } from "@/components/edu/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate } from "@/lib/format";
import type { Homework } from "@/lib/data/types";

type AssignType = "group" | "lesson" | "individual";

export const Route = createFileRoute("/teacher/homework")({ component: TeacherHomework });

function TeacherHomework() {
  const { t, lang } = useI18n();
  const teacherId = useCurrentTeacherId();
  const { groups, homework, submissions, students, lessons, addHomework, gradeSubmission, isLoading } = useData();

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

  const emptyForm = {
    title: "",
    description: "",
    groupId: "",
    assignType: "group" as AssignType,
    lessonId: "",
    studentId: "",
    link: "",
    dueDate: "",
    dueTime: "23:59",
  };
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);

  const groupLessons = useMemo(
    () => lessons.filter((l) => l.groupId === form.groupId).sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [lessons, form.groupId],
  );
  const groupStudents = useMemo(() => {
    const grp = myGroups.find((g) => g.id === form.groupId);
    if (!grp) return [];
    const ids = new Set(grp.studentIds);
    return students.filter((s) => ids.has(s.id));
  }, [myGroups, students, form.groupId]);

  const submit = () => {
    if (!form.title.trim() || !form.groupId || !form.dueDate || !teacherId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    if (form.assignType === "lesson" && !form.lessonId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    if (form.assignType === "individual" && !form.studentId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    addHomework(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        groupId: form.groupId,
        assignType: form.assignType,
        lessonId: form.assignType === "lesson" ? form.lessonId : undefined,
        individualStudentId: form.assignType === "individual" ? form.studentId : undefined,
        link: form.link.trim() || undefined,
        teacherId,
        dueDate: new Date(`${form.dueDate}T${form.dueTime || "23:59"}:00`).toISOString(),
      },
      file ?? undefined,
    );
    toast.success(t("hw.created"));
    setCreateOpen(false);
    setForm(emptyForm);
    setFile(null);
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
          <TabsContent value="active" className="mt-4">
            <HomeworkList
              list={active}
              groupById={groupById}
              submissions={submissions}
              onSelect={setReviewing}
              emptyTitle={t("hw.empty")}
              emptyDescription={lang === "uz" ? "Hozircha vazifalar yaratilmagan" : "Пока нет созданных заданий"}
              emptyAction={{ label: t("hw.add"), onClick: () => setCreateOpen(true) }}
            />
          </TabsContent>
          <TabsContent value="archived" className="mt-4">
            <HomeworkList
              list={archived}
              groupById={groupById}
              submissions={submissions}
              onSelect={setReviewing}
              emptyTitle={t("hw.empty")}
              emptyDescription={lang === "uz" ? "Hozircha vazifalar yaratilmagan" : "Пока нет созданных заданий"}
              emptyAction={{ label: t("hw.add"), onClick: () => setCreateOpen(true) }}
            />
          </TabsContent>
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
              <Select
                value={form.groupId}
                onValueChange={(v) => setForm({ ...form, groupId: v, lessonId: "", studentId: "" })}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {myGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.assignType")}*</Label>
              <Select
                value={form.assignType}
                onValueChange={(v) => setForm({ ...form, assignType: v as AssignType, lessonId: "", studentId: "" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">{t("hw.assignType.group")}</SelectItem>
                  <SelectItem value="lesson">{t("hw.assignType.lesson")}</SelectItem>
                  <SelectItem value="individual">{t("hw.assignType.individual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.assignType === "lesson" && (
              <div className="space-y-1.5">
                <Label>{t("hw.field.lesson")}*</Label>
                <Select value={form.lessonId} onValueChange={(v) => setForm({ ...form, lessonId: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {groupLessons.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{formatDate(l.datetime, lang)}{l.topic ? ` — ${l.topic}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.assignType === "individual" && (
              <div className="space-y-1.5">
                <Label>{t("hw.field.student")}*</Label>
                <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {groupStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("hw.field.title")}*</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.description")}</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.link")}</Label>
              <Input
                type="url"
                placeholder="https://…"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hw.field.file")}</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                  <label className="cursor-pointer">
                    <Paperclip className="size-3.5" />
                    {t("hw.field.filePick")}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </Button>
                {file && <span className="truncate text-xs text-muted-foreground">{file.name}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hw-due-date">{t("hw.field.due")}*</Label>
                {/* Срок сдачи в прошлом бессмыслен — отсекаем на вводе, а не при сохранении. */}
                <DateInput
                  id="hw-due-date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  minDate={todayIso()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>&nbsp;</Label>
                <Input type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
              </div>
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
