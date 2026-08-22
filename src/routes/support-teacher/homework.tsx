import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { HomeworkList, ReviewPanel } from "@/components/edu/homework-review-panel";
import { CardGridSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import type { Homework } from "@/lib/data/types";

export const Route = createFileRoute("/support-teacher/homework")({ component: SupportTeacherHomework });

function SupportTeacherHomework() {
  const { t, lang } = useI18n();
  // Группы из store уже отфильтрованы бэкендом по учителям этого помощника.
  const { groups, homework, submissions, students, gradeSubmission, isLoading } = useData();

  const myGroupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
  const myHomework = useMemo(
    () => homework.filter((h) => myGroupIds.has(h.groupId)).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
    [homework, myGroupIds],
  );

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
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

  const [reviewing, setReviewing] = useState<Homework | null>(null);

  if (isLoading) {
    return (
      <PageShell title={lang === "uz" ? "Vazifalar" : "Задания"} subtitle={t("hw.subtitle")}>
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
      title={lang === "uz" ? "Vazifalar" : "Задания"}
      subtitle={t("hw.subtitle")}
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
            />
          </TabsContent>
          <TabsContent value="archived" className="mt-4">
            <HomeworkList
              list={archived}
              groupById={groupById}
              submissions={submissions}
              onSelect={setReviewing}
              emptyTitle={t("hw.empty")}
            />
          </TabsContent>
        </Tabs>
      </div>

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
