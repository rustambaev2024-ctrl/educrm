import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, BookOpen, Award, Wallet, Star, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useCurrentParentId } from "@/lib/data/identity";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

export const Route = createFileRoute("/parent/children")({ component: ParentChildren });

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function scoreTone(pct: number) {
  if (pct >= 85) return "bg-success/15 text-success";
  if (pct >= 65) return "bg-info/15 text-info";
  if (pct >= 50) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function ParentChildren() {
  const { t, lang } = useI18n();
  const parentId = useCurrentParentId();
  const { parents, students, lessons, groups, rooms, grades, attendance, homework, submissions, staff } = useData();

  const me = useMemo(() => parents.find((p) => p.id === parentId), [parents, parentId]);
  const children = useMemo(
    () => (me ? students.filter((s) => me.childrenIds.includes(s.id)) : []),
    [me, students],
  );
  const [activeChildId, setActiveChildId] = useState<string>(() => children[0]?.id ?? "");
  const child = children.find((c) => c.id === activeChildId) ?? children[0];

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const teacherById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  if (!child) {
    return (
      <div className="mx-auto max-w-md px-4 py-5">
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{t("parent.noChildren")}</Card>
      </div>
    );
  }

  const myGroupIds = new Set(child.groupIds);
  const myGroups = groups.filter((g) => myGroupIds.has(g.id));
  const upcoming = lessons
    .filter((l) => myGroupIds.has(l.groupId) && new Date(l.datetime).getTime() >= Date.now())
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 5);
  const childGrades = grades.filter((g) => g.studentId === child.id).sort((a, b) => b.date.localeCompare(a.date));
  const avg = childGrades.length
    ? Math.round(childGrades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / childGrades.length)
    : 0;
  const att = attendance.filter((a) => a.studentId === child.id);
  const attPct = att.length ? Math.round((att.filter((a) => a.status !== "absent").length / att.length) * 100) : 100;
  const childHwIds = homework.filter((h) => myGroupIds.has(h.groupId)).map((h) => h.id);
  const childSubs = submissions.filter((s) => s.studentId === child.id && childHwIds.includes(s.homeworkId));
  const pendingHw = childHwIds.length - childSubs.filter((s) => s.status !== "pending").length;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <h1 className="text-2xl font-bold">{t("nav.children")}</h1>

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
        <div className="grid grid-cols-4 divide-x divide-border/40 text-center">
          <Mini icon={Award} value={String(avg)} label={t("profile.avgGrade")} />
          <Mini icon={Calendar} value={`${attPct}%`} label={t("profile.attendance")} />
          <Mini icon={BookOpen} value={String(pendingHw)} label={t("parent.activeHw")} />
          <Mini icon={Wallet} value={child.balance < 0 ? "−" : "+"} label={t("parent.balance")} valueClass={child.balance < 0 ? "text-destructive" : "text-success"} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">{t("profile.tab.overview")}</TabsTrigger>
          <TabsTrigger value="grades">{t("profile.tab.grades")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("profile.tab.attendance")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <Card className="p-4 shadow-elegant">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.title")}</div>
            <div className="space-y-2">
              {myGroups.map((g) => (
                <div key={g.id} className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-primary text-xs font-bold text-primary-foreground">{g.name[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{g.name}</div>
                    <div className="text-[11px] text-muted-foreground">{teacherById[g.teacherId]?.fullName ?? "—"}</div>
                  </div>
                </div>
              ))}
              {myGroups.length === 0 && <div className="text-xs text-muted-foreground">{t("students.noGroups")}</div>}
            </div>
          </Card>

          <Card className="p-4 shadow-elegant">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("parent.upcomingLessons")}</div>
            <div className="space-y-2">
              {upcoming.length === 0 && <div className="text-xs text-muted-foreground">{t("schedule.empty")}</div>}
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
                const pct = (g.score / g.maxScore) * 100;
                return (
                  <div key={g.id} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.title}</div>
                      <div className="text-[11px] text-muted-foreground">{t(`gkind.${g.kind}`)} · {formatDate(g.date, lang)}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(pct)}`}>{g.score}</span>
                  </div>
                );
              })}
              {childGrades.length === 0 && <div className="text-xs text-muted-foreground">{t("grades.empty")}</div>}
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 shadow-elegant">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><Wallet className="size-5" /></div>
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
            const pct = (g.score / g.maxScore) * 100;
            return (
              <Card key={g.id} className="p-3 shadow-elegant">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" className="text-[10px]">{t(`gkind.${g.kind}`)}</Badge>
                    <div className="mt-1 truncate text-sm font-medium">{g.title}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(g.date, lang)}</div>
                  </div>
                  <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${scoreTone(pct)}`}>
                    <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/{g.maxScore}</span>
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
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-gradient-primary" style={{ width: `${attPct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-success/10 p-2"><div className="font-bold text-success">{att.filter((a) => a.status === "present").length}</div><div className="text-muted-foreground">{t("att.present")}</div></div>
              <div className="rounded-md bg-warning/15 p-2"><div className="font-bold text-warning">{att.filter((a) => a.status === "late").length}</div><div className="text-muted-foreground">{t("att.late")}</div></div>
              <div className="rounded-md bg-destructive/10 p-2"><div className="font-bold text-destructive">{att.filter((a) => a.status === "absent").length}</div><div className="text-muted-foreground">{t("att.absent")}</div></div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Mini({ icon: Icon, value, label, valueClass }: { icon: typeof Calendar; value: string; label: string; valueClass?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-3">
      <Icon className="size-3.5 text-muted-foreground" />
      <div className={`text-base font-bold leading-none ${valueClass ?? ""}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
