import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Users, Calendar } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { addDays, dayLabel, formatDate, formatTime, sameDay, startOfWeek } from "@/lib/format";
import type { Lesson } from "@/lib/data/types";

export const Route = createFileRoute("/admin/schedule")({ component: SchedulePage });

function SchedulePage() {
  const { t, lang } = useI18n();
  const { lessons, groups, rooms, staff, courses } = useData();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<Lesson | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor],
  );

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const day of days) {
      const list = lessons
        .filter((l) => sameDay(new Date(l.datetime), day))
        .sort((a, b) => a.datetime.localeCompare(b.datetime));
      map.set(day.toDateString(), list);
    }
    return map;
  }, [days, lessons]);

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  const today = new Date();
  const weekStartLabel = formatDate(weekAnchor.toISOString(), lang);
  const weekEndLabel = formatDate(addDays(weekAnchor, 6).toISOString(), lang);

  return (
    <>
      <PageHeader
        title={t("schedule.title")}
        description={t("schedule.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
            >
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">{t("schedule.prev")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekAnchor(startOfWeek(new Date()))}
            >
              <Calendar className="mr-1 size-4" />
              {t("schedule.today")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
            >
              <span className="hidden sm:inline">{t("schedule.next")}</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4" />
          <span>
            {t("schedule.weekRange")}: {weekStartLabel} - {weekEndLabel}
          </span>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1180px] grid-cols-7 gap-3 lg:min-w-0">
            {days.map((day) => {
              const isToday = sameDay(day, today);
              const list = lessonsByDay.get(day.toDateString()) ?? [];
              return (
                <Card
                  key={day.toISOString()}
                  className={`flex h-[min(66vh,680px)] min-h-80 flex-col overflow-hidden p-0 shadow-elegant ${isToday ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
                >
                  <div className="flex shrink-0 items-start justify-between border-b border-border/60 bg-card/95 p-3">
                    <div>
                      <div
                        className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {dayLabel(((day.getDay() + 6) % 7) + 1, lang, true)}
                      </div>
                      <div
                        className={`text-xl font-bold leading-none ${isToday ? "text-primary" : ""}`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                    <Badge
                      variant={list.length > 0 ? "default" : "outline"}
                      className="h-6 min-w-6 justify-center px-1.5 text-[11px]"
                    >
                      {list.length}
                    </Badge>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pr-1.5">
                    {list.length === 0 && (
                      <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border/70 text-center text-[11px] text-muted-foreground/70">
                        {t("schedule.empty")}
                      </div>
                    )}
                    {list.map((lesson) => {
                      const group = groupById[lesson.groupId];
                      if (!group) return null;
                      const teacher = teacherById[group.teacherId];
                      const room = roomById[lesson.roomId];
                      const cancelled = lesson.status === "cancelled";
                      const completed = lesson.status === "completed";
                      const statusTone =
                        lesson.status === "completed"
                          ? "bg-emerald-500"
                          : lesson.status === "cancelled"
                            ? "bg-destructive"
                            : lesson.status === "rescheduled"
                              ? "bg-amber-500"
                              : "bg-primary";
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => setSelected(lesson)}
                          className={`group w-full rounded-xl border border-border/70 bg-muted/20 p-2.5 text-left text-xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm ${cancelled ? "opacity-55" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                              <Clock className="size-3" />
                              {formatTime(lesson.datetime)}
                            </div>
                            <span className={`size-2 rounded-full ${statusTone}`} />
                          </div>
                          <div
                            className={`mt-1 line-clamp-2 min-h-8 font-semibold leading-4 ${cancelled ? "line-through" : ""}`}
                          >
                            {group.name}
                          </div>
                          <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{room?.name ?? "-"}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {teacher?.fullName ?? "-"}
                          </div>
                          {(cancelled || completed || lesson.status === "rescheduled") && (
                            <div className="mt-2">
                              <LessonStatusBadge status={lesson.status} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <LessonDetailDialog
        lesson={selected}
        onClose={() => setSelected(null)}
        helpers={{ groupById, roomById, teacherById, courseById }}
      />
    </>
  );
}

function LessonDetailDialog({
  lesson,
  onClose,
  helpers,
}: {
  lesson: Lesson | null;
  onClose: () => void;
  helpers: {
    groupById: Record<string, ReturnType<typeof useData>["groups"][number]>;
    roomById: Record<string, ReturnType<typeof useData>["rooms"][number]>;
    teacherById: Record<string, ReturnType<typeof useData>["staff"][number]>;
    courseById: Record<string, ReturnType<typeof useData>["courses"][number]>;
  };
}) {
  const { t, lang } = useI18n();
  const { setLessonStatus, rescheduleLesson } = useData();
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const open = lesson !== null;
  const group = lesson ? helpers.groupById[lesson.groupId] : null;
  const room = lesson ? helpers.roomById[lesson.roomId] : null;
  const teacher = group ? helpers.teacherById[group.teacherId] : null;
  const course = group ? helpers.courseById[group.courseId] : null;

  const handleClose = () => {
    setReason("");
    setNewDate("");
    setNewTime("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-2xl overflow-y-auto">
        {lesson && group && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {group.name}
                <LessonStatusBadge status={lesson.status} />
              </DialogTitle>
              <DialogDescription>
                {course?.name} - {formatDate(lesson.datetime, lang)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
                <Field
                  icon={Clock}
                  label={t("common.today")}
                  value={`${formatTime(lesson.datetime)} - ${lesson.durationMinutes} ${lang === "uz" ? "daqiqa" : "min"}`}
                />
                <Field icon={MapPin} label={t("groups.field.room")} value={room?.name ?? "-"} />
                <Field
                  icon={Users}
                  label={t("groups.field.students")}
                  value={`${group.studentIds.length} / ${group.capacity}`}
                />
                <Field
                  icon={Users}
                  label={t("groups.field.teacher")}
                  value={teacher?.fullName ?? "-"}
                />
              </div>

              {lesson.status === "scheduled" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reason" className="text-xs">
                      {t("schedule.cancelReason")}
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="..."
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="newDate" className="text-xs">
                        {t("groups.field.startDate")}
                      </Label>
                      <Input
                        id="newDate"
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="newTime" className="text-xs">
                        {t("common.today")}
                      </Label>
                      <Input
                        id="newTime"
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {lesson.cancelReason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <div className="font-semibold text-destructive">{t("schedule.cancelReason")}</div>
                  <div className="mt-1 text-muted-foreground">{lesson.cancelReason}</div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {lesson.status === "scheduled" && (
                <>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setLessonStatus(lesson.id, "cancelled", reason || undefined);
                      toast.success(t("schedule.cancelled"));
                      handleClose();
                    }}
                  >
                    {t("schedule.cancel")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!newDate || !newTime) {
                        toast.error(t("validation.fillAll"));
                        return;
                      }
                      rescheduleLesson(lesson.id, new Date(`${newDate}T${newTime}`).toISOString());
                      toast.success(t("schedule.rescheduled"));
                      handleClose();
                    }}
                  >
                    {t("schedule.reschedule")}
                  </Button>
                  <Button
                    onClick={() => {
                      setLessonStatus(lesson.id, "completed");
                      toast.success(t("schedule.completed"));
                      handleClose();
                    }}
                  >
                    {t("schedule.markCompleted")}
                  </Button>
                </>
              )}
              {lesson.status !== "scheduled" && (
                <Button variant="outline" onClick={handleClose}>
                  {t("common.back")}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
