import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, Clock, DollarSign, MapPin, TrendingUp, Users } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { attendancePercentage } from "@/lib/data/metrics";
import { formatMoney, formatTime, sameDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

const lessonStatusMeta: Record<string, { className: string; uz: string; ru: string }> = {
  scheduled: { className: "badge-status-trial", uz: "Rejalashtirilgan", ru: "Запланирован" },
  conducted: { className: "badge-status-active", uz: "O'tildi", ru: "Проведен" },
  cancelled: { className: "badge-status-debt", uz: "Bekor", ru: "Отменен" },
  rescheduled: { className: "badge-status-frozen", uz: "Ko'chirildi", ru: "Перенесен" },
};

const paymentTypeLabels: Record<string, { uz: string; ru: string }> = {
  top_up: { uz: "To'lov", ru: "Платеж" },
  charge: { uz: "Yechim", ru: "Списание" },
  discount: { uz: "Chegirma", ru: "Скидка" },
  refund: { uz: "Qaytarish", ru: "Возврат" },
  expense: { uz: "Xarajat", ru: "Расход" },
  manual_top_up: { uz: "Qo'lda kirim", ru: "Ручное пополнение" },
  manual_charge: { uz: "Qo'lda yechim", ru: "Ручное списание" },
};

const avatarColor = (name: string) => {
  const colors = ["indigo", "green", "amber", "red", "blue", "violet"];
  const first = name.trim().charCodeAt(0);
  return colors[Number.isFinite(first) ? first % colors.length : 0];
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function AdminHome() {
  const { lang } = useI18n();
  const { students, groups, lessons, payments, staff, rooms, courses, attendance, isLoading } = useData();

  const today = new Date();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0);

  const monthRevenue = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    return payments
      .filter((p) => p.direction === "in")
      .filter((p) => {
        const date = new Date(p.date);
        return date.getFullYear() === year && date.getMonth() === month;
      })
      .reduce((sum, payment) => sum + payment.amount, 0);
  }, [payments]);

  const todayLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => sameDay(new Date(lesson.datetime), today))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons],
  );

  const todayAttendancePct = useMemo(() => {
    const todayLessonIds = new Set(todayLessons.map((lesson) => lesson.id));
    const records = attendance.filter((record) => todayLessonIds.has(record.lessonId));
    return attendancePercentage(records);
  }, [attendance, todayLessons]);

  const recentPayments = useMemo(
    () => [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [payments],
  );

  const groupById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((room) => [room.id, room])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((teacher) => [teacher.id, teacher])), [staff]);
  const courseById = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const studentById = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student])), [students]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell title={tr("Boshqaruv paneli", "Панель управления")}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={tr("O'quvchilar", "Ученики")} value={activeStudents} icon={Users} iconColor="indigo" />
        <KpiCard label={tr("Davomat", "Посещаемость")} value={`${todayAttendancePct}%`} icon={TrendingUp} iconColor="green" />
        <KpiCard label={tr("Oylik tushum", "Доход за месяц")} value={formatMoney(monthRevenue, lang)} icon={DollarSign} iconColor="amber" />
        <KpiCard label={tr("Qarzdorlar", "Должники")} value={debtors.length} icon={AlertCircle} iconColor="red" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/50 bg-white dark:bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{tr("Bugungi darslar", "Сегодняшние уроки")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {today.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", { day: "numeric", month: "long" })}
            </p>
          </div>

          {todayLessons.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {tr("Bugun darslar yo'q", "Сегодня уроков нет")}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {todayLessons.slice(0, 7).map((lesson) => {
                const group = groupById[lesson.groupId];
                if (!group) return null;
                const teacher = teacherById[group.teacherId];
                const room = roomById[lesson.roomId];
                const course = courseById[group.courseId];
                const status = lessonStatusMeta[lesson.status] ?? lessonStatusMeta.scheduled;

                return (
                  <div key={lesson.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                    <div className="flex w-14 shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
                      <Clock className="size-3.5 text-muted-foreground" />
                      {formatTime(lesson.datetime)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {course?.name ?? group.name} <span className="font-medium text-muted-foreground">{group.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {teacher?.fullName && <span>{teacher.fullName.split(" ")[0]}</span>}
                        {room?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {room.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-md px-2 py-1 text-[11px] font-medium", status.className)}>
                      {tr(status.uz, status.ru)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border/50 bg-white dark:bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{tr("So'nggi to'lovlar", "Последние платежи")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{tr("Kirim va balans amallari", "Пополнения и списания")}</p>
          </div>

          {recentPayments.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {tr("To'lovlar yo'q", "Платежей нет")}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentPayments.map((payment) => {
                const student = payment.studentId ? studentById[payment.studentId] : undefined;
                const name = student?.fullName ?? paymentTypeLabels[payment.type]?.uz ?? tr("To'lov", "Платеж");
                const isCharge = payment.type === "charge" || payment.type === "manual_charge" || payment.direction === "out";
                const sign = isCharge ? "-" : "+";
                const typeLabel = paymentTypeLabels[payment.type] ?? { uz: payment.type, ru: payment.type };

                return (
                  <div key={payment.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                    <Avatar className="size-9">
                      <AvatarFallback className={cn("text-[11px] font-semibold", `avatar-${avatarColor(name)}`)}>
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatTime(payment.date)} - {payment.method ? tr(`Usul: ${payment.method}`, `Метод: ${payment.method}`) : tr(typeLabel.uz, typeLabel.ru)}
                      </div>
                    </div>
                    <div className={cn("shrink-0 text-sm font-semibold tabular-nums", isCharge ? "text-[#DC2626]" : "text-[#15803D]")}>
                      {sign}{formatMoney(payment.amount, lang)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
