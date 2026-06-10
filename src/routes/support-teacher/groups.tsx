import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, MapPin, Calendar, ChevronRight, Layers, GraduationCap } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupStatusBadge } from "@/components/edu/status-badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { dayLabel } from "@/lib/format";

export const Route = createFileRoute("/support-teacher/groups")({ component: SupportTeacherGroupsPage });

function SupportTeacherGroupsPage() {
  const { t, lang } = useI18n();
  // Группы из store уже отфильтрованы бэкендом по учителям этого помощника.
  const { groups, courses, rooms, isLoading } = useData();
  const [search, setSearch] = useState("");

  const myGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={lang === "uz" ? "Guruhlar" : "Группы"}
      subtitle={`${myGroups.length} ${t("students.count")}`}
    >
      <div className="space-y-4">
        <Input
          placeholder={t("groups.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          autoComplete="off"
        />
        {myGroups.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center shadow-elegant">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <Layers className="size-6" />
            </div>
            <div className="text-base font-semibold">{t("groups.empty")}</div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myGroups.map((g) => {
              const course = courseById[g.courseId];
              const room = roomById[g.roomId];
              const fillPct = Math.min(100, Math.round((g.studentIds.length / g.capacity) * 100));
              return (
                <Card key={g.id} className="flex flex-col gap-3 p-5 shadow-elegant transition-all hover:shadow-elegant-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{g.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{course?.name}</div>
                    </div>
                    <GroupStatusBadge status={g.status} />
                  </div>
                  {g.teacherName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GraduationCap className="size-3.5" />
                      <span className="truncate">
                        {lang === "uz" ? "O'qituvchi" : "Учитель"}: {g.teacherName}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {g.schedule.map((slot, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {dayLabel(slot.day, lang, true)} {slot.start}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="size-3" />{room?.name}</span>
                    <span className="flex items-center gap-1"><Users className="size-3" />{g.studentIds.length}/{g.capacity}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-gradient-primary" style={{ width: `${fillPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{fillPct}%</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild className="mt-1">
                    <Link to="/support-teacher/attendance">
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
