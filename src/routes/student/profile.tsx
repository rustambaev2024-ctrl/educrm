import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Phone, Calendar, Building2, Wallet, Award, BookOpen, ClipboardCheck, LogOut, Moon, Sun, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useData } from "@/lib/data/store";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useCurrentStudentId } from "@/lib/data/identity";
import { attendancePercentage } from "@/lib/data/metrics";
import { LangToggle } from "@/components/edu/lang-toggle";
import { StudentStatusBadge } from "@/components/edu/status-badge";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/student/profile")({ component: StudentProfile });

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function scoreTone(pct: number) {
  if (pct >= 85) return "bg-success/15 text-success";
  if (pct >= 65) return "bg-info/15 text-info";
  if (pct >= 50) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function StudentProfile() {
  const { t, lang } = useI18n();
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const studentId = useCurrentStudentId();
  const { students, branches, parents, grades, attendance, lessons, payments, homework, submissions } = useData();

  const stu = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);
  const branch = useMemo(() => branches.find((b) => b.id === stu?.branchId), [branches, stu]);
  const parent = useMemo(() => parents.find((p) => p.id === stu?.parentId), [parents, stu]);

  const myGrades = useMemo(
    () => grades.filter((g) => g.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date)),
    [grades, studentId],
  );
  const avg = myGrades.length
    ? Math.round((myGrades.reduce((s, g) => s + (g.score / g.maxScore) * 10, 0) / myGrades.length) * 10) / 10
    : 0;

  const myAttendance = useMemo(() => attendance.filter((a) => a.studentId === studentId), [attendance, studentId]);
  const attPct = attendancePercentage(myAttendance);

  const myPayments = useMemo(
    () => payments.filter((p) => p.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date)),
    [payments, studentId],
  );

  const activeHw = useMemo(() => {
    if (!studentId) return 0;
    const groupIds = new Set(stu?.groupIds ?? []);
    const myGroupHwIds = homework.filter((h) => groupIds.has(h.groupId)).map((h) => h.id);
    return myGroupHwIds.filter((hwId) => {
      const sub = submissions.find((s) => s.homeworkId === hwId && s.studentId === studentId);
      return !sub || sub.status === "pending";
    }).length;
  }, [homework, submissions, studentId, stu]);

  const upcomingLessons = useMemo(() => {
    if (!stu) return [];
    const myGroupIds = new Set(stu.groupIds);
    return lessons
      .filter((l) => myGroupIds.has(l.groupId) && new Date(l.datetime).getTime() >= Date.now())
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
      .slice(0, 5);
  }, [lessons, stu]);

  if (!stu) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{t("students.notFound")}</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      {/* Header */}
      <Card className="overflow-hidden p-0 shadow-elegant">
        <div className="bg-gradient-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <Avatar className="size-16 ring-2 ring-white/20">
              {stu.photo && <AvatarImage src={stu.photo} alt={stu.fullName} />}
              <AvatarFallback className="bg-white/20 text-lg font-bold text-primary-foreground">
                {initialsOf(stu.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{stu.fullName}</h2>
              <div className="text-xs opacity-90">{stu.phone}</div>
              <div className="mt-1.5"><StudentStatusBadge status={stu.status} /></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/40">
          <Stat label={t("profile.attendance")} value={`${attPct}%`} icon={ClipboardCheck} />
          <Stat label={t("profile.avgGrade")} value={String(avg)} icon={Award} />
          <Stat label={t("profile.activeHomework")} value={String(activeHw)} icon={BookOpen} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t("profile.tab.overview")}</TabsTrigger>
          <TabsTrigger value="grades">{t("profile.tab.grades")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("profile.tab.attendance")}</TabsTrigger>
          <TabsTrigger value="payments">{t("profile.tab.payments")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <Card className="p-4 shadow-elegant">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.personal")}</div>
            <div className="mt-3 space-y-2.5 text-sm">
              <Row icon={Phone} label={t("profile.phone")} value={stu.phone} />
              {stu.birthDate && <Row icon={Calendar} label={t("profile.birthDate")} value={formatDate(stu.birthDate, lang)} />}
              {branch && <Row icon={Building2} label={t("profile.branch")} value={branch.name} />}
              {parent && <Row icon={Phone} label={t("profile.parent")} value={`${parent.fullName} · ${parent.phone}`} />}
              <Separator />
              <Row
                icon={Wallet}
                label={t("profile.balance")}
                value={formatMoney(stu.balance, lang)}
                valueClass={stu.balance < 0 ? "text-destructive font-bold" : "text-success font-bold"}
              />
            </div>
          </Card>

          {upcomingLessons.length > 0 && (
            <Card className="p-4 shadow-elegant">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("parent.upcomingLessons")}</div>
              <div className="space-y-2">
                {upcomingLessons.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-sm">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <span className="flex-1">{formatDate(l.datetime, lang)}</span>
                    <span className="text-xs text-muted-foreground">{new Date(l.datetime).toLocaleTimeString(lang === "uz" ? "uz-Latn" : "ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="grades" className="mt-3 space-y-2">
          {myGrades.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{t("grades.empty")}</Card>
          ) : (
            myGrades.map((g) => {
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
            })
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-3 space-y-3">
          <Card className="p-4 shadow-elegant">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.attendance")}</div>
              <div className="text-3xl font-bold">{attPct}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-gradient-primary" style={{ width: `${attPct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-success/10 p-2"><div className="font-bold text-success">{myAttendance.filter((a) => a.status === "present").length}</div><div className="text-muted-foreground">{t("att.present")}</div></div>
              <div className="rounded-md bg-warning/15 p-2"><div className="font-bold text-warning">{myAttendance.filter((a) => a.status === "late").length}</div><div className="text-muted-foreground">{t("att.late")}</div></div>
              <div className="rounded-md bg-destructive/10 p-2"><div className="font-bold text-destructive">{myAttendance.filter((a) => a.status === "absent").length}</div><div className="text-muted-foreground">{t("att.absent")}</div></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-3 space-y-2">
          {myPayments.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{t("finance.empty")}</Card>
          ) : (
            myPayments.map((p) => (
              <Card key={p.id} className="flex items-center gap-3 p-3 shadow-elegant">
                <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success"><Wallet className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{formatMoney(p.amount, lang)}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(p.date, lang)} · {t(`finance.method.${p.method}`)}</div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Settings */}
      <Card className="p-4 shadow-elegant">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.settings")}</div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("profile.lang")}</span>
            <LangToggle />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("profile.theme")}</span>
            <Button variant="outline" size="sm" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => { logout(); navigate({ to: "/" }); }}
      >
        <LogOut className="mr-2 size-4" /> {t("profile.logout")}
      </Button>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Wallet }) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value, valueClass }: { icon: typeof Wallet; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`ml-auto truncate text-sm ${valueClass ?? "font-medium"}`}>{value}</span>
    </div>
  );
}
