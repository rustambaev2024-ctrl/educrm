import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LessonStatusBadge } from "@/components/edu/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentStudentId } from "@/lib/data/identity";
import { addDays, dayLabel, formatDate, formatTime, sameDay, startOfWeek } from "@/lib/format";

export const Route = createFileRoute("/student/schedule")({ component: StudentSchedulePage });

function StudentSchedulePage() {
  const { t, lang } = useI18n();
  const { lessons, groups, rooms, staff, isLoading } = useData();
  const studentId = useCurrentStudentId();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);
  const today = new Date();

  const myGroupIds = useMemo(
    () => new Set(studentId ? groups.filter((g) => g.studentIds?.includes(studentId)).map((g) => g.id) : []),
    [groups, studentId],
  );
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  const myLessons = useMemo(
    () =>
      lessons
        .filter((l) => myGroupIds.has(l.groupId))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons, myGroupIds],
  );

  const [selectedDay, setSelectedDay] = useState<Date>(today);

  const dayLessons = useMemo(
    () => myLessons.filter((l) => sameDay(new Date(l.datetime), selectedDay)),
    [myLessons, selectedDay],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
          <div className="text-xs text-muted-foreground">{t("student.schedule.subtitle")}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setWeekAnchor(startOfWeek(today));
            setSelectedDay(today);
          }}
        >
          {t("schedule.today")}
        </Button>
      </div>

      {/* Week strip */}
      <Card className="p-3 shadow-elegant">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-xs font-medium text-muted-foreground">
            {formatDate(weekAnchor.toISOString(), lang)} — {formatDate(addDays(weekAnchor, 6).toISOString(), lang)}
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const isSel = sameDay(d, selectedDay);
            const isToday = sameDay(d, today);
            const count = myLessons.filter((l) => sameDay(new Date(l.datetime), d)).length;
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDay(d)}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-all ${
                  isSel
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : isToday
                      ? "border border-primary/40 text-primary"
                      : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase">
                  {dayLabel(((d.getDay() + 6) % 7) + 1, lang, true)}
                </span>
                <span className="text-base font-bold leading-none">{d.getDate()}</span>
                {count > 0 && (
                  <span className={`mt-0.5 size-1.5 rounded-full ${isSel ? "bg-primary-foreground" : "bg-primary"}`} />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Day lessons */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Calendar className="size-3.5" />
          {formatDate(selectedDay.toISOString(), lang)}
          <Badge variant="outline" className="ml-auto">{dayLessons.length}</Badge>
        </div>
        {dayLessons.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center shadow-elegant">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
              <Calendar className="size-5" />
            </div>
            <div className="text-sm text-muted-foreground">{t("student.schedule.empty")}</div>
          </Card>
        ) : (
          dayLessons.map((lesson) => {
            const group = groupById[lesson.groupId];
            const room = roomById[lesson.roomId];
            const teacher = group ? teacherById[group.teacherId] : null;
            return (
              <Card key={lesson.id} className="overflow-hidden shadow-elegant">
                <div className="flex">
                  <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 bg-gradient-primary py-3 text-primary-foreground">
                    <span className="text-[10px] font-semibold uppercase opacity-80">{formatTime(lesson.datetime)}</span>
                    <span className="text-xs opacity-70">
                      {formatTime(new Date(new Date(lesson.datetime).getTime() + lesson.durationMinutes * 60_000).toISOString())}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{group?.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t("student.with")}: {teacher?.fullName}
                        </div>
                      </div>
                      {lesson.status !== "scheduled" && <LessonStatusBadge status={lesson.status} />}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="size-3" />{room?.name}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{lesson.durationMinutes} {lang === "uz" ? "daq." : "мин"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}