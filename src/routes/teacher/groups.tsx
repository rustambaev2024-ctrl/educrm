import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, ChevronRight, Layers, MapPin, Users } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { GroupStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentTeacherId } from "@/lib/data/identity";
import { dayLabel, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/teacher/groups")({ component: TeacherGroupsPage });

function TeacherGroupsPage() {
  const { t, lang } = useI18n();
  const { groups, courses, rooms, isLoading } = useData();
  const teacherId = useCurrentTeacherId();
  const [search, setSearch] = useState("");

  const myGroups = useMemo(() => {
    const list = groups.filter((g) => g.teacherId === teacherId);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, teacherId, search]);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  return (
    <PageShell
      title={t("teacher.myGroups")}
      subtitle={isLoading ? undefined : `${myGroups.length} ${t("students.count")}`}
    >
      <div className="flex flex-col gap-4">
        <Input
          placeholder={t("groups.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          disabled={isLoading}
        />

        {isLoading ? (
          // Скелет повторяет форму карточки, а не крутится в пустоте: видно,
          // сколько всего появится и какой формы, — ожидание читается как
          // загрузка списка, а не как «что-то происходит».
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        ) : myGroups.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-6" />}
            title={t("groups.empty")}
            description={
              search.trim()
                ? lang === "uz"
                  ? "Qidiruvni o'zgartirib ko'ring."
                  : "Попробуйте изменить запрос поиска."
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myGroups.map((g) => {
              const course = courseById[g.courseId];
              const room = roomById[g.roomId];
              const filled = g.studentIds.length;
              const fillPct = g.capacity > 0 ? Math.round((filled / g.capacity) * 100) : 0;
              // Переполнение — единственное состояние, которое требует внимания.
              // Наполненная группа это норма, а норма не окрашивается.
              const overbooked = filled > g.capacity;

              return (
                <Card key={g.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{g.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{course?.name}</div>
                    </div>
                    <GroupStatusBadge status={g.status} />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {g.schedule.map((slot, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {dayLabel(slot.day, lang, true)} {slot.start}
                      </Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{room?.name}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3 shrink-0" />
                      <span className={overbooked ? "font-semibold text-warn" : undefined}>
                        {filled}/{g.capacity}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.min(100, fillPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={overbooked ? "h-full bg-warn" : "h-full bg-primary"}
                        style={{ width: `${Math.min(100, fillPct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{fillPct}%</span>
                      <span>{formatMoney(g.monthlyPrice, lang)}</span>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" asChild className="mt-1">
                    <Link to="/teacher/attendance">
                      <Calendar className="mr-1 size-3.5" /> {t("teacher.openAttendance")}
                      <ChevronRight className="ml-auto size-3.5" />
                    </Link>
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
