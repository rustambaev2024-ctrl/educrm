import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, ArrowRight, Calendar, Clock, DollarSign, MapPin, Receipt, TrendingUp, UserPlus, Users } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/edu/kpi-card";
import { useData } from "@/lib/data/store";
import { sumIncome } from "@/lib/data/mappers";
import { useI18n } from "@/lib/i18n";
import { attendancePercentage } from "@/lib/data/metrics";
import { countActiveStudents, isDebtor } from "@/lib/data/definitions";
import { formatMoney, formatTime, getLocalDateString, initialsOf, sameDay } from "@/lib/format";
import { getAvatarColor } from "@/lib/avatar-color";

/** Сколько уроков показываем на панели. Остаток не исчезает: под списком
 *  появляется строка «Ещё N» с переходом в расписание. */
const TODAY_LESSONS_VISIBLE = 7;

export const Route = createFileRoute("/admin/")({ component: AdminHome });

const lessonStatusBadge: Record<string, { cls: string; uz: string; ru: string }> = {
  scheduled:  { cls: "badge-plan",   uz: "Rejalashtirilgan", ru: "Запланирован" },
  conducted:  { cls: "badge-done",   uz: "O'tildi",          ru: "Проведен" },
  cancelled:  { cls: "badge-cancel", uz: "Bekor",            ru: "Отменен" },
  rescheduled:{ cls: "badge-frozen", uz: "Ko'chirildi",      ru: "Перенесен" },
};

const paymentTypeLabels: Record<string, { uz: string; ru: string }> = {
  top_up:        { uz: "To'lov",         ru: "Платеж" },
  charge:        { uz: "Yechim",         ru: "Списание" },
  discount:      { uz: "Chegirma",       ru: "Скидка" },
  refund:        { uz: "Qaytarish",      ru: "Возврат" },
  expense:       { uz: "Xarajat",        ru: "Расход" },
  manual_top_up: { uz: "Qo'lda kirim",   ru: "Ручное пополнение" },
  manual_charge: { uz: "Qo'lda yechim",  ru: "Ручное списание" },
};

function AdminHome() {
  const { lang, plural } = useI18n();
  const navigate = useNavigate();
  const { students, groups, lessons, payments, staff, rooms, courses, attendance, isLoading } = useData();

  const today = new Date();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const activeStudents = countActiveStudents(students);
  const debtors = students.filter(isDebtor);

  const monthRevenue = useMemo(() => {
    const yr = today.getFullYear();
    const mo = today.getMonth();
    return sumIncome(
      payments.filter((p) => {
        const d = new Date(p.date);
        return d.getFullYear() === yr && d.getMonth() === mo;
      }),
    );
  }, [payments]);

  const todayLessons = useMemo(
    () => lessons.filter((l) => sameDay(new Date(l.datetime), today)).sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [lessons],
  );

  const todayAttendancePct = useMemo(() => {
    const ids = new Set(todayLessons.map((l) => l.id));
    return attendancePercentage(attendance.filter((r) => ids.has(r.lessonId)));
  }, [attendance, todayLessons]);

  const recentPayments = useMemo(() => [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [payments]);

  const groupById   = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById    = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((t) => [t.id, t])), [staff]);
  const courseById  = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const todayLabel = today.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", { day: "numeric", month: "long", year: "numeric" });

  if (isLoading) {
    return (
      <PageShell title={tr("Boshqaruv paneli", "Панель управления")} subtitle={todayLabel}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={tr("Boshqaruv paneli", "Панель управления")}
      subtitle={todayLabel}
      actions={
        <button className="btn-primary" onClick={() => navigate({ to: "/admin/students" })}>
          <UserPlus style={{ width: 14, height: 14 }} />
          {tr("Yangi o'quvchi", "Новый ученик")}
        </button>
      }
    >
      {/* KPI grid */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={tr("O'quvchilar", "Ученики")}      value={activeStudents}            icon={Users}       color="blue" />
        <KpiCard label={tr("Davomat", "Посещаемость")}     value={`${todayAttendancePct}%`}  icon={TrendingUp}  color="green" />
        <KpiCard label={tr("Oylik tushum", "Доход/месяц")} value={formatMoney(monthRevenue, lang)} icon={DollarSign} color="cyan" />
        <KpiCard label={tr("Qarzdorlar", "Должники")}      value={debtors.length}            icon={AlertCircle} color="red" />
      </div>

      {/* Two-column cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Today's lessons */}
        <div className="edu-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-muted px-3.5 py-3">
            <div>
              <div className="text-[13px] font-bold text-foreground">{tr("Bugungi darslar", "Сегодняшние уроки")}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {todayLessons.length} {tr("ta dars", "урок(ов)")}
              </div>
            </div>
            <button
              onClick={() => navigate({ to: "/admin/schedule" })}
              className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
            >
              {tr("Barchasi", "Все")}
            </button>
          </div>

          {todayLessons.length === 0 ? (
            <EmptyState
              icon={<Calendar className="size-6" />}
              title={tr("Bugun darslar yo'q", "Сегодня уроков нет")}
            />
          ) : (
            <div>
              <div className="divide-y divide-border">
                {todayLessons.slice(0, TODAY_LESSONS_VISIBLE).map((lesson) => {
                  const group = groupById[lesson.groupId];
                  if (!group) return null;
                  const teacher  = teacherById[group.teacherId];
                  const room     = roomById[lesson.roomId];
                  const course   = courseById[group.courseId];
                  const meta     = lessonStatusBadge[lesson.status] ?? lessonStatusBadge.scheduled;
                  return (
                    <div
                      key={lesson.id}
                      className="edu-row flex min-h-11 items-center gap-3 px-4 py-2.5"
                    >
                      <div className="flex min-w-11 items-center gap-1 text-[12px] font-bold text-primary">
                        <Clock className="size-3" />
                        {formatTime(lesson.datetime)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-foreground">
                          {course?.name ?? group.name}
                          {" "}<span className="font-normal text-muted-foreground">{group.name}</span>
                        </div>
                        <div className="mt-px flex gap-2 text-[11px] text-muted-foreground">
                          {teacher?.fullName && <span>{teacher.fullName.split(" ")[0]}</span>}
                          {room?.name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="size-2.5" />
                              {room.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={meta.cls}>{tr(meta.uz, meta.ru)}</span>
                    </div>
                  );
                })}
              </div>

              {todayLessons.length > TODAY_LESSONS_VISIBLE && (
                <button
                  onClick={() => navigate({ to: "/admin/schedule" })}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-border bg-transparent px-3.5 py-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-muted/50"
                >
                  {tr(
                    `Yana ${todayLessons.length - TODAY_LESSONS_VISIBLE} ta dars`,
                    `Ещё ${todayLessons.length - TODAY_LESSONS_VISIBLE} ${plural(todayLessons.length - TODAY_LESSONS_VISIBLE, "урок", "урока", "уроков")}`,
                  )}
                  <ArrowRight className="size-[13px]" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recent payments */}
        <div className="edu-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-muted px-3.5 py-3">
            <div>
              <div className="text-[13px] font-bold text-foreground">{tr("So'nggi to'lovlar", "Последние платежи")}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{tr("Kirim va balans amallari", "Пополнения и списания")}</div>
            </div>
            <button
              onClick={() => navigate({ to: "/admin/finance" })}
              className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
            >
              {tr("Barchasi", "Все")}
            </button>
          </div>

          {recentPayments.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-6" />}
              title={tr("To'lovlar yo'q", "Платежей нет")}
            />
          ) : (
            <div className="divide-y divide-border">
              {recentPayments.map((payment) => {
                const student  = payment.studentId ? studentById[payment.studentId] : undefined;
                const name     = student?.fullName ?? paymentTypeLabels[payment.type]?.uz ?? tr("To'lov", "Платеж");
                const isCharge = payment.type === "charge" || payment.type === "manual_charge" || payment.direction === "out";
                const typeLabel = paymentTypeLabels[payment.type] ?? { uz: payment.type, ru: payment.type };
                return (
                  <div
                    key={payment.id}
                    className="edu-row flex min-h-11 items-center gap-3 px-4 py-2.5"
                  >
                    <div
                      className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${getAvatarColor(name)}`}
                    >
                      {initialsOf(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-foreground">
                        {name}
                      </div>
                      <div className="mt-px text-[11px] text-muted-foreground">
                        {formatTime(payment.date)} · {payment.method ?? tr(typeLabel.uz, typeLabel.ru)}
                      </div>
                    </div>
                    <div className={`flex-shrink-0 text-[13px] font-bold ${isCharge ? "text-destructive" : "text-ok"}`}>
                      {isCharge ? "−" : "+"}{formatMoney(payment.amount, lang)}
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
