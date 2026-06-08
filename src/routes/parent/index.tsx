import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, MapPin, Wallet, BookOpen, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parentApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrentParentId } from "@/lib/data/identity";
import { formatMoney, formatTime } from "@/lib/format";

export const Route = createFileRoute("/parent/")({ component: ParentHome });

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function ParentHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const parentId = useCurrentParentId();
  const { parents, students, lessons, groups, rooms, homework, submissions, attendance, reload, isLoading } = useData();
  const [linkCode, setLinkCode] = useState("");
  const [syncing, setSyncing] = useState(false);

  const me = useMemo(() => parents.find((p) => p.id === parentId), [parents, parentId]);
  const children = useMemo(
    () => (me ? students.filter((s) => me.childrenIds.includes(s.id)) : []),
    [me, students],
  );

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("parent.greeting")},</div>
        <h1 className="text-2xl font-bold">{me?.fullName ?? user?.fullName ?? "—"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("parent.childrenCount").replace("{n}", String(children.length))}</p>
      </div>

      {children.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-elegant">{t("parent.noChildren")}</Card>
      )}

      <Card className="space-y-3 p-4 shadow-elegant">
        <div>
          <div className="font-semibold">{lang === "uz" ? "Farzandni ulash" : "Привязать ребёнка"}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "uz" ? "Admin bergan 6 xonali kodni kiriting. Kod 24 soat amal qiladi." : "Введите 6-значный код от администратора. Код действует 24 часа."}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={linkCode}
            onChange={(event) => setLinkCode(event.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            maxLength={6}
            inputMode="numeric"
            className="font-mono text-lg tracking-widest text-center"
            autoComplete="off"
          />
          <Button
            disabled={syncing || linkCode.length !== 6}
            onClick={async () => {
              setSyncing(true);
              try {
                await parentApi.linkChild(linkCode);
                setLinkCode("");
                await reload();
                toast.success(lang === "uz" ? "Farzand kabinetga ulandi" : "Ребёнок успешно привязан");
              } catch {
                toast.error(lang === "uz" ? "Kod noto'g'ri yoki muddati o'tgan" : "Код неверный или истёк");
              } finally {
                setSyncing(false);
              }
            }}
          >
            {lang === "uz" ? "Ulash" : "Привязать"}
          </Button>
        </div>
      </Card>

      {children.map((child) => {
        const myGroupIds = new Set(groups.filter((g) => g.studentIds?.includes(child.id)).map((g) => g.id));
        const next = lessons
          .filter((l) => myGroupIds.has(l.groupId) && new Date(l.datetime).getTime() >= Date.now())
          .sort((a, b) => a.datetime.localeCompare(b.datetime))[0];
        const nextGroup = next ? groupById[next.groupId] : null;
        const nextRoom = next ? roomById[next.roomId] : null;

        // homework progress
        const childHwIds = homework.filter((h) => myGroupIds.has(h.groupId)).map((h) => h.id);
        const childSubs = submissions.filter((s) => s.studentId === child.id && childHwIds.includes(s.homeworkId));
        const pendingHw = childHwIds.length - childSubs.filter((s) => s.status !== "pending").length;

        // attendance
        const att = attendance.filter((a) => a.studentId === child.id);
        const attPct = att.length
          ? Math.round((att.filter((a) => a.status !== "absent").length / att.length) * 100)
          : 100;

        const debt = child.balance < 0;

        return (
          <Card key={child.id} className="overflow-hidden p-0 shadow-elegant">
            <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-subtle p-4">
              <Avatar className="size-11">
                {child.photo && <AvatarImage src={child.photo} alt={child.fullName} />}
                <AvatarFallback className="bg-gradient-primary text-sm font-semibold text-primary-foreground">
                  {initialsOf(child.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{child.fullName}</div>
                <div className="text-xs text-muted-foreground">{attPct}% {t("parent.attendance").toLowerCase()}</div>
              </div>
              {debt ? (
                <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/15"><AlertCircle className="mr-1 size-3" /> {t("status.debtor")}</Badge>
              ) : (
                <Badge className="bg-success/10 text-success hover:bg-success/15"><CheckCircle2 className="mr-1 size-3" /> {t("status.active")}</Badge>
              )}
            </div>

            {next && nextGroup && (
              <Link to="/parent/children" className="flex items-center gap-3 border-b border-border/40 p-4 transition-colors hover:bg-accent/30">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                  <Clock className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("parent.nextLesson")}</div>
                  <div className="truncate text-sm font-medium">{nextGroup.name}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatTime(next.datetime)}</span>
                    {nextRoom && <span className="flex items-center gap-1"><MapPin className="size-3" /> {nextRoom.name}</span>}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            )}

            <div className="grid grid-cols-2 divide-x divide-border/40">
              <div className="p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-3" /> {t("parent.activeHw")}
                </div>
                <div className="mt-1 text-lg font-bold">
                  {pendingHw} <span className="text-sm font-normal text-muted-foreground">/ {childHwIds.length}</span>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Wallet className="size-3" /> {t("parent.balance")}
                </div>
                <div className={`mt-1 text-lg font-bold ${child.balance < 0 ? "text-destructive" : "text-success"}`}>
                  {formatMoney(child.balance, lang)}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
