import { useMemo, useState } from "react";
import { BookOpen, Calendar, Users, ChevronRight, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { formatDate, initialsOf } from "@/lib/format";
import type { Homework, HomeworkSubmission } from "@/lib/data/types";

export function dueState(dueIso: string): { tone: string; key: "overdue" | "dueToday" | "dueIn"; days: number } {
  const now = new Date();
  const due = new Date(dueIso);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { tone: "bg-destructive/10 text-destructive", key: "overdue", days: -diff };
  if (diff === 0) return { tone: "bg-warning/15 text-warning", key: "dueToday", days: 0 };
  return { tone: "bg-success/10 text-success", key: "dueIn", days: diff };
}

export function HomeworkList({
  list,
  groupById,
  submissions,
  onSelect,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  list: Homework[];
  groupById: Record<string, { name: string; studentIds: string[] } | undefined>;
  submissions: HomeworkSubmission[];
  onSelect: (h: Homework) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
}) {
  const { t, lang } = useI18n();

  if (list.length === 0) {
    return (
      <Card className="shadow-elegant">
        <EmptyState
          icon={<BookOpen className="size-7" />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {list.map((h) => {
        const grp = groupById[h.groupId];
        const subs = submissions.filter((s) => s.homeworkId === h.id);
        const done = subs.filter((s) => s.status !== "pending").length;
        const total = grp?.studentIds.length ?? subs.length;
        const due = dueState(h.dueDate);
        return (
          <Card key={h.id} className="cursor-pointer p-4 shadow-elegant transition-shadow hover:shadow-elegant-lg" onClick={() => onSelect(h)}>
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
}

export function ReviewPanel({
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
                        <Label className="text-[11px]">{t("hw.grade")} (2-5)</Label>
                        <Input
                          type="number"
                          min={2}
                          max={5}
                          step={1}
                          value={draft.score}
                          onChange={(e) => setDrafts({ ...drafts, [sid]: { ...draft, score: e.target.value } })}
                          className="h-9"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const n = Number(draft.score);
                          if (Number.isNaN(n) || n < 2 || n > 5 || !Number.isInteger(n)) return;
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
