import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, TrendingUp, DollarSign, AlertCircle, Clock, MapPin, ArrowRight } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { attendancePercentage } from "@/lib/data/metrics";
import { formatMoney, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

const LESSON_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  conducted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  rescheduled: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function AdminHome() {
  const { lang } = useI18n();
  const { students, groups, lessons, payments, staff, rooms, courses, attendance, isLoading } = useData();

  const today = new Date();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const lessonStatusLabel = (status: string) => {
    const map: Record<string, [string, string]> = {
      scheduled: ["Rejada", "Запланирован"],
      conducted: ["O'tkazildi", "Проведён"],
      cancelled: ["Bekor qilindi", "Отменён"],
      rescheduled: ["Ko'chirildi", "Перенесён"],
    };
    const pair = map[status];
    return pair ? tr(pair[0], pair[1]) : status;
  };

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0);

  // Месячный доход: входящие платежи текущего месяца
  const monthRevenue = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    return payments
      .filter((p) => p.direction === "in")
      .filter((p) => {
        const d = new Date(p.date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const todayLessons = useMemo(
    () =>
      lessons
        .filter((l) => sameDay(new Date(l.datetime), today))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons],
  );

  // Сегодняшняя посещаемость: attendance по урокам сегодняшнего дня
  const todayAttendancePct = useMemo(() => {
    const todayLessonIds = new Set(todayLessons.map((l) => l.id));
    const records = attendance.filter((a) => todayLessonIds.has(a.lessonId));
    return attendancePercentage(records);
  }, [attendance, todayLessons]);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .filter((p) => p.direction === "in")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [payments],
  );

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell title={tr("Bugun", "Сегодня")} subtitle={today.toLocaleDateString(lang === "uz" ? "uz-UZ" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })}>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={tr("O'quvchilar", "Ученики")} value={activeStudents} icon={Users} iconColor="blue" />
        <KpiCard
          label={tr("Bugungi davomat", "Посещаемость")}
          value={`${todayAttendancePct}%`}
          icon={TrendingUp}
          iconColor="green"
        />
        <KpiCard
          label={tr("Oylik tushum", "Доход за месяц")}
          value={formatMoney(monthRevenue, lang)}
          icon={DollarSign}
          iconColor="violet"
        />
        <KpiCard label={tr("Qarzdorlar", "Должники")} value={debtors.length} icon={AlertCircle} iconColor="red" />
      </div>

      {/* Two columns */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Today lessons */}
        <div className="rounded-md border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-[13px] font-medium">{tr("Bugungi darslar", "Сегодняшние занятия")}</div>
            <Link to="/admin/schedule" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              {tr("Jadval", "Расписание")} <ArrowRight className="size-3" />
            </Link>
          </div>
          {todayLessons.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {tr("Bugun darslar yo'q", "Сегодня занятий нет")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todayLessons.slice(0, 7).map((l) => {
                const g = groupById[l.groupId];
                if (!g) return null;
                const tch = teacherById[g.teacherId];
                const room = roomById[l.roomId];
                const course = courseById[g.courseId];
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex w-12 shrink-0 items-center gap-1 text-[13px] font-medium tabular-nums text-foreground">
                      <Clock className="size-3 text-muted-foreground" />
                      {formatTime(l.datetime)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{g.name}</div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {course?.name && <span>{course.name}</span>}
                        {tch?.fullName && <span>{tch.fullName.split(" ")[0]}</span>}
                        {room?.name && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="size-2.5" />
                            {room.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        LESSON_STATUS_STYLES[l.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {lessonStatusLabel(l.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent payments */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-[13px] font-medium">{tr("Oxirgi to'lovlar", "Последние платежи")}</div>
            <Link to="/admin/finance" className="text-muted-foreground hover:text-foreground">
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {recentPayments.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {tr("To'lovlar yo'q", "Платежей нет")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentPayments.map((p) => {
                const stu = p.studentId ? studentById[p.studentId] : undefined;
                const name = stu?.fullName ?? tr("To'lov", "Платёж");
                const initials = name.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase();
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-[11px] font-medium">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{formatTime(p.date)}</div>
                    </div>
                    <div className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      + {formatMoney(p.amount, lang)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
