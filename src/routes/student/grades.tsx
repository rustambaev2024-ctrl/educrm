import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Award, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCurrentStudentId } from "@/lib/data/identity";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/student/grades")({ component: StudentGradesPage });

function scoreTone(pct: number) {
  if (pct >= 85) return "bg-success/15 text-success";
  if (pct >= 65) return "bg-info/15 text-info";
  if (pct >= 50) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function StudentGradesPage() {
  const { t, lang } = useI18n();
  const studentId = useCurrentStudentId();
  const { grades, groups, courses, isLoading } = useData();

  const groupById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const myGrades = useMemo(
    () => grades.filter((grade) => grade.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date)),
    [grades, studentId],
  );
  const average = myGrades.length
    ? Math.round((myGrades.reduce((sum, grade) => sum + (grade.score / grade.maxScore) * 10, 0) / myGrades.length) * 10) / 10
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {myGrades.length} {t("grades.title").toLowerCase()} · {t("grades.average")} {average}
        </p>
      </div>

      <Card className="overflow-hidden p-0 shadow-elegant">
        <div className="bg-gradient-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
              <Award className="size-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider opacity-80">{t("grades.average")}</div>
              <div className="text-3xl font-bold">{average}/10</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {myGrades.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">
            {t("grades.empty")}
          </Card>
        ) : (
          myGrades.map((grade) => {
            const group = groupById[grade.groupId];
            const course = group ? courseById[group.courseId] : undefined;
            const pct = (grade.score / grade.maxScore) * 100;
            return (
              <Card key={grade.id} className="p-4 shadow-elegant">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {t(`gkind.${grade.kind}`)}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{formatDate(grade.date, lang)}</span>
                    </div>
                    <div className="mt-2 font-semibold">{grade.title}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {course?.name ?? group?.name ?? ""}
                    </div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-sm font-bold ${scoreTone(pct)}`}>
                    <Star className="size-3.5" />
                    {grade.score}
                    <span className="text-xs opacity-60">/{grade.maxScore}</span>
                  </div>
                </div>
                {grade.comment && (
                  <p className="mt-3 border-t border-border/40 pt-2 text-xs text-muted-foreground">{grade.comment}</p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
