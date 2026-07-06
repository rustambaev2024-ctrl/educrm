import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, X, Clock, Wifi, FileText, ClipboardCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, ListSkeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { groupApi, attendanceApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { formatDate, formatTime } from "@/lib/format";
import { mapStudents, toResults, type StudentRaw } from "@/lib/data/mappers";
import type { AttendanceStatus, Student } from "@/lib/data/types";

export const Route = createFileRoute("/teacher/attendance")({ component: AttendancePage });

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "excused", "absent"];

const STATUS_META: Record<AttendanceStatus, { icon: typeof Check; tone: string; activeTone: string; key: string; short: string }> = {
  present: {
    icon: Check,
    tone: "border-border text-muted-foreground hover:bg-success/10 hover:text-success",
    activeTone: "border-success bg-success text-success-foreground",
    key: "att.present",
    short: "K",
  },
  late: {
    icon: Clock,
    tone: "border-border text-muted-foreground hover:bg-warning/15 hover:text-warning-foreground",
    activeTone: "border-warning bg-warning text-warning-foreground",
    key: "att.late",
    short: "Q",
  },

  excused: {
    icon: FileText,
    tone: "border-border text-muted-foreground hover:bg-accent",
    activeTone: "border-primary bg-primary text-primary-foreground",
    key: "att.excused",
    short: "S",
  },
  absent: {
    icon: X,
    tone: "border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
    activeTone: "border-destructive bg-destructive text-destructive-foreground",
    key: "att.absent",
    short: "Y",
  },
};

function AttendancePage() {
  const { t, lang } = useI18n();
  const { groups, lessons, students, getAttendanceFor, setAttendance, isLoading } = useData();
  const teacherId = useCurrentTeacherId();

  const myGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.teacherId === teacherId).map((g) => g.id)),
    [groups, teacherId],
  );

  const myLessons = useMemo(
    () =>
      lessons
        // Отменённые уроки нельзя отмечать (бэкенд их отклоняет) — убираем из селектора.
        .filter((l) => myGroupIds.has(l.groupId) && l.status !== "cancelled")
        .sort((a, b) => Math.abs(new Date(a.datetime).getTime() - Date.now()) - Math.abs(new Date(b.datetime).getTime() - Date.now())),
    [lessons, myGroupIds],
  );

  const [selectedLessonId, setSelectedLessonId] = useState<string>("");

  useEffect(() => {
    if (!selectedLessonId && myLessons.length > 0) {
      const lessonWithStudents = myLessons.find((item) => {
        const itemGroup = groups.find((groupItem) => groupItem.id === item.groupId);
        return (itemGroup?.studentIds.length ?? 0) > 0;
      });
      setSelectedLessonId((lessonWithStudents ?? myLessons[0]).id);
    }
  }, [groups, myLessons, selectedLessonId]);

  const lesson = myLessons.find((l) => l.id === selectedLessonId);
  const group = lesson ? groups.find((g) => g.id === lesson.groupId) : undefined;
  const [lessonStudents, setLessonStudents] = useState<Student[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  useEffect(() => {
    if (!group?.id) {
      setLessonStudents([]);
      return;
    }

    let cancelled = false;
    setIsRosterLoading(true);
    void groupApi
      .students(group.id)
      .then((raw) => {
        if (cancelled) return;
        setLessonStudents(mapStudents(toResults(raw as { results: StudentRaw[] } | StudentRaw[])) as Student[]);
      })
      .catch((error) => {
        console.warn("[attendance] failed to load group roster:", error);
        if (!cancelled) setLessonStudents([]);
      })
      .finally(() => {
        if (!cancelled) setIsRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [group?.id]);

  const groupStudents = useMemo(
    () => {
      if (!group) return [];
      if (lessonStudents.length > 0) return lessonStudents;

      const studentsById = new Map(students.map((student) => [student.id, student]));
      return group.studentIds
        .map((studentId) => studentsById.get(studentId))
        .filter((student): student is Student => Boolean(student));
    },
    [group, lessonStudents, students],
  );

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    if (!lesson) return;
    const existing = getAttendanceFor(lesson.id);
    if (existing.length > 0) {
      setMarks(Object.fromEntries(existing.map((r) => [r.studentId, r.status])));
    } else {
      setMarks({});
    }
  }, [lesson, getAttendanceFor]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    if (!groupStudents.length) return;
    setMarks(Object.fromEntries(groupStudents.map((s) => [s.id, "present" as const])));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!lesson) return;
    const records = groupStudents.map((s) => ({
      studentId: s.id,
      status: marks[s.id] ?? "absent",
    }));
    setIsSaving(true);
    try {
      await attendanceApi.bulkMark(
        lesson.id,
        records.map((r) => ({
          student_id: r.studentId,
          status: r.status,
        })),
      );
      setAttendance(lesson.id, records);
      toast.success(t("att.saved"));
    } catch (err) {
      console.error("[attendance] save failed:", err);
      toast.error(lang === "uz" ? "Davomatni saqlashda xatolik" : "Ошибка сохранения посещаемости");
    } finally {
      setIsSaving(false);
    }
  };

  const summary = useMemo(() => {
    const present = Object.values(marks).filter((s) => s === "present").length;
    const absent = Object.values(marks).filter((s) => s === "absent").length;
    const late = Object.values(marks).filter((s) => s === "late").length;
    return { present, absent, late };
  }, [marks]);

  if (isLoading) {
    return (
      <PageShell title={t("att.title")} subtitle={t("att.subtitle")}>
        <div className="space-y-4">
          <Card className="p-4 shadow-elegant">
            <Skeleton className="h-9 w-full max-w-md" />
          </Card>
          <Card className="p-5 shadow-elegant">
            <ListSkeleton rows={6} />
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={t("att.title")} subtitle={t("att.subtitle")}>
      <div className="space-y-4">
        {myLessons.length === 0 ? (
          <Card className="shadow-elegant">
            <EmptyState
              icon={<ClipboardCheck className="size-7" />}
              title={t("att.noLesson")}
              description={lang === "uz"
                ? "Bugun uchun belgilanadigan darslar yo'q"
                : "На сегодня нет уроков для отметки"}
            />
          </Card>
        ) : (
          <>
            <Card className="flex flex-col gap-3 p-4 shadow-elegant md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("att.pickLesson")}
                </span>
                <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
                  <SelectTrigger className="w-full sm:max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {myLessons.slice(0, 50).map((l) => {
                      const g = groups.find((x) => x.id === l.groupId);
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {g?.name} · {formatDate(l.datetime, lang)} {formatTime(l.datetime)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {lesson && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={markAllPresent}>
                    {t("att.markAll")}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    <Save className="mr-1 size-4" /> {isSaving ? "..." : t("att.saveAll")}
                  </Button>
                </div>
              )}
            </Card>

            {lesson && group && (
              <Card className="p-5 shadow-elegant">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div>
                    <div className="text-base font-semibold">{group.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(lesson.datetime, lang)} · {formatTime(lesson.datetime)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="text-success">● {summary.present}</span>
                    <span className="text-destructive">● {summary.absent}</span>
                    <span className="text-warning-foreground">● {summary.late}</span>
                  </div>
                </div>

                <div className="mb-3 rounded-xl bg-secondary/50 p-3 sm:hidden">
                  <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
                    {STATUS_ORDER.map((status) => {
                      const meta = STATUS_META[status];
                      return (
                        <div key={status} className="rounded-lg border border-border/60 px-1 py-1">
                          <div className="text-sm text-foreground">{meta.short}</div>
                          <div className="truncate">{t(meta.key)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isRosterLoading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">O'quvchilar yuklanmoqda...</div>
                ) : groupStudents.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Guruhda faol o'quvchi yo'q</div>
                ) : (
                  <div className="space-y-2">
                    {groupStudents.map((student) => {
                      const initials = student.fullName
                        .split(" ")
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase();
                      return (
                        <div
                          key={student.id}
                          className="flex flex-col gap-2 rounded-lg border border-border/50 p-2.5 transition-colors hover:bg-accent/30 sm:flex-row sm:items-center sm:gap-3 sm:p-3"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <Avatar className="size-8 sm:size-9">
                              <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{student.fullName}</div>
                              <div className="truncate text-xs text-muted-foreground">{student.phone}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:gap-1.5">
                            {STATUS_ORDER.map((status) => {
                              const meta = STATUS_META[status];
                              const Icon = meta.icon;
                              const active = marks[student.id] === status;
                              return (
                                <button
                                  key={status}
                                  onClick={() => setStatus(student.id, status)}
                                  className={`flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-all sm:justify-start sm:gap-1 sm:rounded-md sm:px-2.5 sm:text-[11px] ${
                                    active ? meta.activeTone : meta.tone
                                  }`}
                                  aria-label={t(meta.key)}
                                  title={t(meta.key)}
                                >
                                  <span className="sm:hidden">{meta.short}</span>
                                  <Icon className="hidden size-3.5 sm:block" />
                                  <span className="hidden sm:inline">{t(meta.key)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
