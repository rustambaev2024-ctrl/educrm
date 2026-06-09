import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, Clock, DollarSign, MapPin, TrendingUp, UserPlus, Users } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { attendancePercentage } from "@/lib/data/metrics";
import { formatMoney, formatTime, getLocalDateString, sameDay } from "@/lib/format";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

/* avatar color index 0-4 */
const avaIdx = (name: string) => (name.trim().charCodeAt(0) || 0) % 5;
const avaBg  = ["#dbeafe","#dcfce7","#fce7f3","#fef3c7","#f3e8ff"];
const avaTxt = ["#1d4ed8","#15803d","#9d174d","#92400e","#7c3aed"];

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

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
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { students, groups, lessons, payments, staff, rooms, courses, attendance, isLoading } = useData();

  const today = new Date();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const activeStudents = students.filter((s) => s.status === "active" || s.status === "debtor").length;
  const debtors = students.filter((s) => s.status === "debtor" || s.balance < 0);

  const monthRevenue = useMemo(() => {
    const yr = today.getFullYear();
    const mo = today.getMonth();
    return payments
      .filter((p) => p.direction === "in")
      .filter((p) => { const d = new Date(p.date); return d.getFullYear() === yr && d.getMonth() === mo; })
      .reduce((s, p) => s + p.amount, 0);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", borderBottom: "2px solid #0077b6", animation: "spin 1s linear infinite" }} />
      </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}
           className="md:grid-cols-4">
        <KpiCard label={tr("O'quvchilar", "Ученики")}      value={activeStudents}            icon={Users}       color="blue" />
        <KpiCard label={tr("Davomat", "Посещаемость")}     value={`${todayAttendancePct}%`}  icon={TrendingUp}  color="green" />
        <KpiCard label={tr("Oylik tushum", "Доход/месяц")} value={formatMoney(monthRevenue, lang)} icon={DollarSign} color="cyan" />
        <KpiCard label={tr("Qarzdorlar", "Должники")}      value={debtors.length}            icon={AlertCircle} color="red" />
      </div>

      {/* Two-column cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }} className="lg:grid-cols-2">

        {/* Today's lessons */}
        <div className="edu-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{tr("Bugungi darslar", "Сегодняшние уроки")}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {todayLessons.length} {tr("ta dars", "урок(ов)")}
              </div>
            </div>
            <button
              onClick={() => navigate({ to: "/admin/schedule" })}
              style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              {tr("Barchasi", "Все")}
            </button>
          </div>

          {todayLessons.length === 0 ? (
            <div style={{ padding: "36px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              {tr("Bugun darslar yo'q", "Сегодня уроков нет")}
            </div>
          ) : (
            <div>
              {todayLessons.slice(0, 7).map((lesson) => {
                const group = groupById[lesson.groupId];
                if (!group) return null;
                const teacher  = teacherById[group.teacherId];
                const room     = roomById[lesson.roomId];
                const course   = courseById[group.courseId];
                const meta     = lessonStatusBadge[lesson.status] ?? lessonStatusBadge.scheduled;
                return (
                  <div
                    key={lesson.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid #f8fafc", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div style={{ minWidth: 44, fontWeight: 700, color: "#0077b6", fontSize: 12, display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock style={{ width: 11, height: 11 }} />
                      {formatTime(lesson.datetime)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {course?.name ?? group.name}
                        {" "}<span style={{ fontWeight: 400, color: "#64748b" }}>{group.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, display: "flex", gap: 8 }}>
                        {teacher?.fullName && <span>{teacher.fullName.split(" ")[0]}</span>}
                        {room?.name && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <MapPin style={{ width: 10, height: 10 }} />
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
          )}
        </div>

        {/* Recent payments */}
        <div className="edu-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{tr("So'nggi to'lovlar", "Последние платежи")}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{tr("Kirim va balans amallari", "Пополнения и списания")}</div>
            </div>
            <button
              onClick={() => navigate({ to: "/admin/finance" })}
              style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              {tr("Barchasi", "Все")}
            </button>
          </div>

          {recentPayments.length === 0 ? (
            <div style={{ padding: "36px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              {tr("To'lovlar yo'q", "Платежей нет")}
            </div>
          ) : (
            <div>
              {recentPayments.map((payment) => {
                const student  = payment.studentId ? studentById[payment.studentId] : undefined;
                const name     = student?.fullName ?? paymentTypeLabels[payment.type]?.uz ?? tr("To'lov", "Платеж");
                const isCharge = payment.type === "charge" || payment.type === "manual_charge" || payment.direction === "out";
                const typeLabel = paymentTypeLabels[payment.type] ?? { uz: payment.type, ru: payment.type };
                const idx = avaIdx(name);
                return (
                  <div
                    key={payment.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid #f8fafc", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, background: avaBg[idx], color: avaTxt[idx] }}>
                      {initials(name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                        {formatTime(payment.date)} · {payment.method ?? tr(typeLabel.uz, typeLabel.ru)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, flexShrink: 0, color: isCharge ? "#dc2626" : "#16a34a" }}>
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
