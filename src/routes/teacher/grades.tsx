import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Award, Trash2, Users, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ListSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate, getLocalDateString, initialsOf } from "@/lib/format";
import { getAvatarColor } from "@/lib/avatar-color";
import type { GradeKind } from "@/lib/data/types";

export const Route = createFileRoute("/teacher/grades")({ component: TeacherGrades });

const KIND_OPTIONS: GradeKind[] = ["lesson", "homework", "exam", "activity"];

function scoreTone(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 85) return "bg-success/15 text-success";
  if (pct >= 65) return "bg-info/15 text-info";
  if (pct >= 50) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function TeacherGrades() {
  const { t, lang } = useI18n();
  const teacherId = useCurrentTeacherId();
  const { groups, grades, students, addGrade, deleteGrade, isLoading } = useData();

  const myGroups = useMemo(() => groups.filter((g) => g.teacherId === teacherId), [groups, teacherId]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [deleteGradeId, setDeleteGradeId] = useState<string | null>(null);

  const confirmDeleteGrade = () => {
    if (!deleteGradeId) return;
    deleteGrade(deleteGradeId);
    setDeleteGradeId(null);
    toast.success(t("grades.deleted"));
  };
  useEffect(() => {
    if (!selectedGroupId && myGroups.length > 0) {
      setSelectedGroupId(myGroups[0].id);
    }
  }, [myGroups]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const selectedGroup = myGroups.find((g) => g.id === selectedGroupId);

  const groupGrades = useMemo(
    () => grades.filter((g) => g.groupId === selectedGroupId).sort((a, b) => b.date.localeCompare(a.date)),
    [grades, selectedGroupId],
  );

  const avgByStudent = useMemo(() => {
    const map: Record<string, { sum: number; cnt: number }> = {};
    for (const g of groupGrades) {
      if (!map[g.studentId]) map[g.studentId] = { sum: 0, cnt: 0 };
      map[g.studentId].sum += (g.score / g.maxScore) * 10;
      map[g.studentId].cnt += 1;
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Math.round((v.sum / v.cnt) * 10) / 10]));
  }, [groupGrades]);

  const overallAvg = useMemo(() => {
    if (groupGrades.length === 0) return 0;
    return Math.round((groupGrades.reduce((s, g) => s + (g.score / g.maxScore) * 10, 0) / groupGrades.length) * 10) / 10;
  }, [groupGrades]);

  const topStudentsCount = useMemo(() => {
    return Object.values(avgByStudent).filter((v) => v.cnt > 0 && (v.sum / v.cnt) >= 8).length;
  }, [avgByStudent]);

  const [open, setOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [form, setForm] = useState({ kind: "lesson" as GradeKind, score: "", comment: "" });

  const submit = () => {
    const score = Number(form.score);
    if (!selectedStudentId || !form.score || Number.isNaN(score) || score < 0 || score > 10 || !selectedGroup || !teacherId) {
      toast.error(t("validation.fillAll"));
      return;
    }
    addGrade({
      groupId: selectedGroup.id,
      studentId: selectedStudentId,
      teacherId,
      kind: form.kind,
      title: t(`gkind.${form.kind}`),
      score,
      maxScore: 10,
      date: getLocalDateString(),
      comment: form.comment.trim() || undefined,
    });
    toast.success(t("grades.created"));
    setOpen(false);
    setSelectedStudentId("");
    setForm({ kind: "lesson", score: "", comment: "" });
  };

  if (isLoading) {
    return (
      <PageShell title={t("grades.title")} subtitle={t("grades.subtitle")}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 min-[360px]:gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <Card className="overflow-hidden p-0 shadow-elegant">
            <ListSkeleton rows={6} />
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t("grades.title")}
      subtitle={t("grades.subtitle")}
      actions={
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="h-8 w-[140px] max-w-[55vw] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {myGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 min-[360px]:gap-3">
          <KpiCard label={t("grades.title")} value={groupGrades.length} icon={BookOpen} iconColor="blue" />
          <KpiCard label={t("grades.average")} value={`${overallAvg} / 10`} icon={Award} iconColor="green" />
          <KpiCard label={lang === "uz" ? "A'lochi o'quvchilar" : "Отличники"} value={topStudentsCount} icon={Users} iconColor="violet" />
        </div>
        <Card className="overflow-hidden p-0 shadow-elegant">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
            {t("grades.average")} - {t("groups.field.students")}. {t("grades.add")}: {lang === "uz" ? "o'quvchini bosing" : "нажмите на ученика"}
          </div>
          <div className="divide-y divide-border/60">
            {(selectedGroup?.studentIds ?? []).map((sid) => {
              const stu = studentById[sid];
              const avg = avgByStudent[sid];
              return (
                <button
                  key={sid}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50"
                  onClick={() => {
                    setSelectedStudentId(sid);
                    setOpen(true);
                  }}
                >
                  <Avatar className="size-8">
                    <AvatarFallback className={`text-[11px] font-semibold text-white ${getAvatarColor(stu?.fullName ?? "?")}`}>
                      {initialsOf(stu?.fullName ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 truncate text-sm">{stu?.fullName ?? sid}</div>
                  {avg !== undefined ? (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(avg, 10)}`}>{avg}/10</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("grades.add")}</span>
                  )}
                </button>
              );
            })}
            {(selectedGroup?.studentIds.length ?? 0) === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("hw.noStudents")}</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0 shadow-elegant">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">{t("grades.title")}</div>
          {groupGrades.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("grades.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("grades.col.student")}</TableHead>
                  <TableHead>{t("grades.col.kind")}</TableHead>
                  <TableHead>{t("grades.col.score")}</TableHead>
                  <TableHead>{t("grades.col.date")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupGrades.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{studentById[g.studentId]?.fullName ?? g.studentId}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{t(`gkind.${g.kind}`)}</Badge></TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(g.score, g.maxScore)}`}>
                        {g.score}<span className="text-muted-foreground">/{g.maxScore}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(g.date, lang)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setDeleteGradeId(g.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </Card>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("grades.add")}</SheetTitle>
            <SheetDescription>{selectedGroup?.name}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <Card className="p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("grades.col.student")}</div>
              <div className="mt-1 font-semibold">{selectedStudentId ? studentById[selectedStudentId]?.fullName ?? selectedStudentId : "-"}</div>
            </Card>
            <div className="space-y-1.5">
              <Label>{t("grades.field.kind")}*</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as GradeKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => <SelectItem key={k} value={k}>{t(`gkind.${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("grades.field.score")}* (0-10)</Label>
              <Input type="number" min={0} max={10} step={1} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("grades.field.comment")}</Label>
              <Textarea rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={submit}><Award className="mr-1 size-4" /> {t("common.save")}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={deleteGradeId !== null}
        onOpenChange={(open) => !open && setDeleteGradeId(null)}
        title={lang === "uz" ? "Bahoni o'chirish" : "Удалить оценку"}
        description={lang === "uz" ? "Bu amalni ortga qaytarib bo'lmaydi." : "Это действие необратимо."}
        confirmText={lang === "uz" ? "O'chirish" : "Удалить"}
        cancelText={lang === "uz" ? "Bekor qilish" : "Отмена"}
        variant="destructive"
        onConfirm={confirmDeleteGrade}
      />
    </PageShell>
  );
}
