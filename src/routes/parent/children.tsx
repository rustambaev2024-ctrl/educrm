import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar, BookOpen, Award, Wallet, Star, Clock, MapPin, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/edu/page-shell";
import { StatTile } from "@/components/edu/stat-tile";
import { ScrollableTabsList } from "@/components/edu/scrollable-tabs-list";
import { CardSkeleton, Skeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentParentId } from "@/lib/data/identity";
import { attendancePercentage, gradeAverage, gradeTone } from "@/lib/data/metrics";
import { formatDate, formatMoney, formatTime, getPaymentLabel, initialsOf } from "@/lib/format";

export const Route = createFileRoute("/parent/children")({ component: ParentChildren });

function ParentChildren() {
  const { t, lang } = useI18n();
  const parentId = useCurrentParentId();
  const { parents, students, lessons, groups, rooms, grades, attendance, homework, submissions, staff, payments, isLoading } = useData();

  const me = useMemo(() => parents.find((p) => p.id === parentId), [parents, parentId]);
  const children = useMemo(
    () => (me ? students.filter((s) => me.childrenIds.includes(s.id)) : []),
    [me, students],
  );
  const [activeChildId, setActiveChildId] = useState<string>("");
  useEffect(() => {
    if (!activeChildId && children.length > 0) {
      setActiveChildId(children[0].id);
    }
  }, [children]);
  const child = children.find((c) => c.id === activeChildId) ?? children[0];

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  if (isLoading) {
    return (
      <PageShell title={t("nav.children")}>
        <div className="mx-auto max-w-md space-y-4 pb-24">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border p-5">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40 max-w-[70%]" />
              <Skeleton className="h-3 w-28 max-w-[50%]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </PageShell>
    );
  }

  if (!child) {
    return (
      <PageShell title={t("nav.children")}>
        <Card className="shadow-elegant">
          <EmptyState icon={<Users className="size-7" />} title={t("parent.noChildren")} />
        </Card>
      </PageShell>
    );
  }

  const myGroups = groups.filter((g) => g.studentIds?.includes(child.id));
  const myGroupIds = new Set(myGroups.map((g) => g.id));
  const upcoming = lessons
    .filter((l) => myGroupIds.has(l.groupId) && new Date(l.datetime).getTime() >= Date.now())
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 5);
  const childGrades = grades.filter((g) => g.studentId === child.id).sort((a, b) => b.date.localeCompare(a.date));
  const avg = gradeAverage(childGrades);
  const att = attendance.filter((a) => a.studentId === child.id);
  // Общим правилом платформы: уважительные не входят в знаменатель, а не
  // считаются присутствием, как было раньше.
  const attPct = att.length ? attendancePercentage(att) : 100;
  const childHwIds = homework.filter((h) => myGroupIds.has(h.groupId)).map((h) => h.id);
  const childSubs = submissions.filter((s) => s.studentId === child.id && childHwIds.includes(s.homeworkId));
  const pendingHw = childHwIds.length - childSubs.filter((s) => s.status !== "pending").length;

  return (
    <PageShell title={t("nav.children")}>
      <div className="mx-auto max-w-md space-y-4 pb-24">
        {children.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveChildId(c.id)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  c.id === child.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent/40"
                }`}
              >
                <Avatar className="size-6">
                  {c.photo && <AvatarImage src={c.photo} alt={c.fullName} />}
                  <AvatarFallback className={`text-[10px] font-semibold ${c.id === child.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-gradient-primary text-primary-foreground"}`}>
                    {initialsOf(c.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{c.fullName.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Header card */}
        <Card className="overflow-hidden p-0 shadow-elegant">
          <div className="bg-gradient-primary p-5 text-primary-foreground">
            <div className="flex items-center gap-3">
              <Avatar className="size-14 ring-2 ring-white/20">
                {child.photo && <AvatarImage src={child.photo} alt={child.fullName} />}
                <AvatarFallback className="bg-white/20 text-base font-bold text-primary-foreground">{initialsOf(child.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">{child.fullName}</div>
                <div className="text-xs opacity-90">{child.phone}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-y divide-x divide-border/40 text-center sm:grid-cols-4 sm:divide-y-0">
            <StatTile variant="bare" size="sm" icon={Award} value={`${avg}/5`} label={t("profile.avgGrade")} />
            <StatTile variant="bare" size="sm" icon={Calendar} value={`${attPct}%`} label={t("profile.attendance")} />
            <StatTile variant="bare" size="sm" icon={BookOpen} value={String(pendingHw)} label={t("parent.activeHw")} />
            <StatTile
              variant="bare"
              size="sm"
              icon={Wallet}
              value={formatMoney(child.balance, lang)}
              label={t("parent.balance")}
              valueClass={child.balance < 0 ? "text-destructive" : "text-success"}
            />
          </div>
        </Card>

        <Tabs defaultValue="overview">
          <ScrollableTabsList columns={4}>
            <TabsTrigger value="overview" className="px-4">{t("profile.tab.overview")}</TabsTrigger>
            <TabsTrigger value="grades" className="px-4">{t("profile.tab.grades")}</TabsTrigger>
            <TabsTrigger value="attendance" className="px-4">{t("profile.tab.attendance")}</TabsTrigger>
            <TabsTrigger value="payments" className="px-4">{lang === "uz" ? "To'lovlar" : "Платежи"}</TabsTrigger>
          </ScrollableTabsList>

          <TabsContent value="overview" className="mt-3 space-y-3">
            <Card className="p-4 shadow-elegant">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.title")}</div>
              <div className="space-y-2">
                {myGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-primary text-xs font-bold text-primary-foreground">{g.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{g.name}</div>
                      <div className="text-[11px] text-muted-foreground">{teacherById[g.teacherId]?.fullName ?? "—"}</div>
                    </div>
                  </div>
                ))}
                {myGroups.length === 0 && <EmptyState icon={<Users className="size-6" />} title={t("students.noGroups")} />}
              </div>
            </Card>

            <Card className="p-4 shadow-elegant">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("parent.upcomingLessons")}</div>
              <div className="space-y-2">
                {upcoming.length === 0 && <EmptyState icon={<Clock className="size-6" />} title={t("schedule.empty")} />}
                {upcoming.map((l) => {
                  const g = groupById[l.groupId];
                  const r = roomById[l.roomId];
                  return (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <Clock className="size-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{g?.name ?? "—"}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{formatDate(l.datetime, lang)} · {formatTime(l.datetime)}</span>
                          {r && <span className="flex items-center gap-0.5"><MapPin className="size-3" /> {r.name}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4 shadow-elegant">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("parent.recentGrades")}</div>
                <Badge variant="outline" className="text-[10px]">{childGrades.length}</Badge>
              </div>
              <div className="space-y-2">
                {childGrades.slice(0, 3).map((g) => {
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{g.title}</div>
                        <div className="text-[11px] text-muted-foreground">{t(`gkind.${g.kind}`)} · {formatDate(g.date, lang)}</div>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(g.score)}`}>{g.score}</span>
                    </div>
                  );
                })}
                {childGrades.length === 0 && <EmptyState icon={<Award className="size-6" />} title={t("grades.empty")} />}
              </div>
            </Card>

            <Card className="flex items-center gap-3 p-4 shadow-elegant">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary"><Wallet className="size-5" /></div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("parent.balance")}</div>
                <div className={`text-lg font-bold ${child.balance < 0 ? "text-destructive" : "text-success"}`}>{formatMoney(child.balance, lang)}</div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="grades" className="mt-3 space-y-2">
            {childGrades.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{t("grades.empty")}</Card>
            ) : childGrades.map((g) => {
              return (
                <Card key={g.id} className="p-3 shadow-elegant">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Badge variant="outline" className="text-[10px]">{t(`gkind.${g.kind}`)}</Badge>
                      <div className="mt-1 truncate text-sm font-medium">{g.title}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(g.date, lang)}</div>
                    </div>
                    <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${gradeTone(g.score)}`}>
                      <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/5</span>
                    </div>
                  </div>
                  {g.comment && <p className="mt-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">{g.comment}</p>}
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="attendance" className="mt-3">
            <Card className="p-4 shadow-elegant">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.attendance")}</div>
                <div className="text-3xl font-bold">{attPct}%</div>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={Math.min(100, attPct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-gradient-primary" style={{ width: `${Math.min(100, attPct)}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-success/10 p-2"><div className="font-bold text-success">{att.filter((a) => a.status === "present").length}</div><div className="text-muted-foreground">{t("att.present")}</div></div>
                <div className="rounded-md bg-warning/15 p-2"><div className="font-bold text-warning">{att.filter((a) => a.status === "late").length}</div><div className="text-muted-foreground">{t("att.late")}</div></div>
                <div className="rounded-md bg-destructive/10 p-2"><div className="font-bold text-destructive">{att.filter((a) => a.status === "absent").length}</div><div className="text-muted-foreground">{t("att.absent")}</div></div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-3 space-y-2">
            {(() => {
              const childPayments = payments
                .filter((p) => p.studentId === child.id)
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 20);
              if (childPayments.length === 0) {
                return <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{lang === "uz" ? "To'lovlar tarixi yo'q" : "История платежей пуста"}</Card>;
              }
              return childPayments.map((p) => {
                const isIncome = p.direction === "in";
                return (
                  <Card key={p.id} className="flex items-center gap-3 p-3 shadow-elegant">
                    <div className={`flex size-8 items-center justify-center rounded-xl text-xs font-bold ${isIncome ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {isIncome ? "+" : "−"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{getPaymentLabel(p.type, lang)}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(p.date, lang)}</div>
                    </div>
                    <div className={`text-sm font-bold ${isIncome ? "text-success" : "text-destructive"}`}>
                      {isIncome ? "+" : "−"}{formatMoney(p.amount, lang)}
                    </div>
                  </Card>
                );
              });
            })()}
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
