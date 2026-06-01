import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, Clock, DollarSign, MapPin, TrendingUp, Users } from "lucide-react";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { attendancePercentage } from "@/lib/data/metrics";
import { formatMoney, formatTime, sameDay } from "@/lib/format";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

const getAvatarStyle = (name: string) => {
  const colors = [
    { bg: "#caf0f8", text: "#0077b6" },
    { bg: "#dcfce7", text: "#166534" },
    { bg: "#fee2e2", text: "#dc2626" },
    { bg: "#fef3c7", text: "#d97706" },
    { bg: "#f3e8ff", text: "#7c3aed" },
  ];
  return colors[(name.trim().charCodeAt(0) || 0) % colors.length];
};

const getInitials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const paymentTypeLabels: Record<string, { uz: string; ru: string }> = {
  top_up:       { uz: "To'lov",         ru: "Платеж" },
  charge:       { uz: "Yechim",         ru: "Списание" },
  discount:     { uz: "Chegirma",       ru: "Скидка" },
  refund:       { uz: "Qaytarish",      ru: "Возврат" },
  expense:      { uz: "Xarajat",        ru: "Расход" },
  manual_top_up:{ uz: "Qo'lda kirim",   ru: "Ручное пополнение" },
  manual_charge:{ uz: "Qo'lda yechim",  ru: "Ручное списание" },
};

const lessonStatusBadge: Record<string, { cls: string; uz: string; ru: string }> = {
  scheduled:  { cls: "badge-plan",   uz: "Rejalashtirilgan", ru: "Запланирован" },
  conducted:  { cls: "badge-active", uz: "O'tildi",          ru: "Проведен" },
  cancelled:  { cls: "badge-cancel", uz: "Bekor",            ru: "Отменен" },
  rescheduled:{ cls: "badge-frozen", uz: "Ko'chirildi",      ru: "Перенесен" },
};

const leadStatusMeta: Record<string, { uz: string; ru: string; color: string }> = {
  new:       { uz: "Yangi",         ru: "Новые",     color: "#0077b6" },
  contacted: { uz: "Aloqa qilindi", ru: "Связались", color: "#00b4d8" },
  trial:     { uz: "Sinov darsi",   ru: "Пробный",   color: "#d97706" },
  won:       { uz: "Yozildi",       ru: "Записан",   color: "#008000" },
  lost:      { uz: "Rad etdi",      ru: "Отказал",   color: "#dc2626" },
};

function AdminHome() {
  const { lang } = useI18n();
  const { students, groups, lessons, payments, staff, rooms, courses, attendance, isLoading } = useData();
  const leads: { status: string }[] = [];

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
        const d = new Date(p.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, p) => sum + p.amount, 0);
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

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById  = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((t) => [t.id, t])), [staff]);
  const courseById  = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const leadCounts = useMemo(() => {
    const counts: Record<string, number> = { new: 0, contacted: 0, trial: 0, won: 0, lost: 0 };
    for (const lead of (leads ?? [])) {
      if (lead.status in counts) counts[lead.status]++;
    }
    return counts;
  }, [leads]);

  const todayLabel = today.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", { day: "numeric", month: "long" });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", borderBottom: "2px solid #0077b6", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <PageShell title={tr("Boshqaruv paneli", "Панель управления")} subtitle={todayLabel}>
      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}
           className="md:grid-cols-4">
        <KpiCard label={tr("O'quvchilar", "Ученики")}       value={activeStudents}               icon={Users}       color="blue" />
        <KpiCard label={tr("Davomat", "Посещаемость")}      value={`${todayAttendancePct}%`}     icon={TrendingUp}  color="green" />
        <KpiCard label={tr("Oylik tushum", "Доход/месяц")}  value={formatMoney(monthRevenue, lang)} icon={DollarSign}  color="cyan" />
        <KpiCard label={tr("Qarzdorlar", "Должники")}       value={debtors.length}               icon={AlertCircle} color="red" />
      </div>

      {/* Two-column cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }} className="lg:grid-cols-2">
        {/* Today's lessons */}
        <div className="edu-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1.5px solid #e0f2fe" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0077b6" }}>{tr("Bugungi darslar", "Сегодняшние уроки")}</div>
            <div style={{ fontSize: 12, color: "#00b4d8", marginTop: 2 }}>
              {todayLessons.length} {tr("ta dars", "урок(ов)")}
            </div>
          </div>
          {todayLessons.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#90e0ef", fontSize: 13 }}>
              {tr("Bugun darslar yo'q", "Сегодня уроков нет")}
            </div>
          ) : (
            <div>
              {todayLessons.slice(0, 7).map((lesson) => {
                const group = groupById[lesson.groupId];
                if (!group) return null;
                const teacher = teacherById[group.teacherId];
                const room = roomById[lesson.roomId];
                const course = courseById[group.courseId];
                const meta = lessonStatusBadge[lesson.status] ?? lessonStatusBadge.scheduled;

                return (
                  <div
                    key={lesson.id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f0f9ff", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f0f9ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div style={{ minWidth: 44, fontWeight: 700, color: "#00b4d8", fontSize: 13, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      {formatTime(lesson.datetime)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0077b6", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {course?.name ?? group.name} <span style={{ fontWeight: 400, color: "#00b4d8" }}>{group.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#90e0ef", marginTop: 1, display: "flex", gap: 8 }}>
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
          <div style={{ padding: "14px 16px", borderBottom: "1.5px solid #e0f2fe" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0077b6" }}>{tr("So'nggi to'lovlar", "Последние платежи")}</div>
            <div style={{ fontSize: 12, color: "#00b4d8", marginTop: 2 }}>{tr("Kirim va balans amallari", "Пополнения и списания")}</div>
          </div>
          {recentPayments.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#90e0ef", fontSize: 13 }}>
              {tr("To'lovlar yo'q", "Платежей нет")}
            </div>
          ) : (
            <div>
              {recentPayments.map((payment) => {
                const student = payment.studentId ? studentById[payment.studentId] : undefined;
                const name = student?.fullName ?? paymentTypeLabels[payment.type]?.uz ?? tr("To'lov", "Платеж");
                const isCharge = payment.type === "charge" || payment.type === "manual_charge" || payment.direction === "out";
                const typeLabel = paymentTypeLabels[payment.type] ?? { uz: payment.type, ru: payment.type };
                const av = getAvatarStyle(name);

                return (
                  <div
                    key={payment.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f0f9ff", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f0f9ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, background: av.bg, color: av.text, flexShrink: 0 }}>
                      {getInitials(name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0077b6", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 11, color: "#90e0ef", marginTop: 1 }}>
                        {formatTime(payment.date)} · {payment.method ?? tr(typeLabel.uz, typeLabel.ru)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, flexShrink: 0, color: isCharge ? "#dc2626" : "#008000" }}>
                      {isCharge ? "−" : "+"}{formatMoney(payment.amount, lang)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Leads status strip */}
      <div className="edu-card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0077b6", marginBottom: 12 }}>{tr("Murojaatlar", "Заявки")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {(["new", "contacted", "trial", "won", "lost"] as const).map((status) => {
            const meta = leadStatusMeta[status];
            return (
              <div
                key={status}
                style={{ textAlign: "center", padding: "10px 8px", borderRadius: 8, background: "#f0f9ff", border: "1.5px solid #e0f2fe" }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: meta.color }}>{leadCounts[status]}</div>
                <div style={{ fontSize: 11, color: "#90e0ef", marginTop: 3 }}>{tr(meta.uz, meta.ru)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
