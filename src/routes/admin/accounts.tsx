import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, EyeOff, Info, KeyRound, RefreshCw, Save, Search, ShieldCheck, GraduationCap, Users, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import type { Parent, Staff, Student } from "@/lib/data/types";

export const Route = createFileRoute("/admin/accounts")({ component: AccountsPage });

type AccountType = "teacher" | "student" | "parent";
type AccountRow = {
  id: string;
  userId?: string;
  type: AccountType;
  fullName: string;
  phone: string;
  branchId?: string;
  ref: Staff | Student | Parent;
};

function makePassword() {
  return `edu${Math.floor(100000 + Math.random() * 900000)}`;
}

function AccountsPage() {
  const { staff, students, parents, branches, updateStaff, updateStudentPasswords, updateParentPassword, isLoading } = useData();
  const { lang } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | AccountType>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches]);

  const rows = useMemo<AccountRow[]>(() => {
    const teachers = staff
      .filter((m) => m.role === "teacher")
      .map((m) => ({ id: m.id, userId: m.userId, type: "teacher" as const, fullName: m.fullName, phone: m.phone, branchId: m.branchId, ref: m }));
    const studentRows = students.map((s) => ({
      id: s.id, userId: s.userId, type: "student" as const, fullName: s.fullName, phone: s.phone, branchId: s.branchId, ref: s,
    }));
    const parentRows = parents.map((p) => ({
      id: p.id, userId: p.userId, type: "parent" as const, fullName: p.fullName, phone: p.phone, ref: p,
    }));
    return [...teachers, ...studentRows, ...parentRows];
  }, [parents, staff, students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== "all" && row.type !== tab) return false;
      if (!q) return true;
      return row.fullName.toLowerCase().includes(q) || row.phone.includes(q);
    });
  }, [query, rows, tab]);

  const t = (key: string) => {
    const uz: Record<string, string> = {
      title: "Akkauntlar",
      description: "O'qituvchi, o'quvchi va ota-onalar kirish ma'lumotlari",
      teachers: "O'qituvchilar",
      students: "O'quvchilar",
      parents: "Ota-onalar",
      all: "Barchasi",
      search: "Ism yoki telefon bo'yicha qidirish",
      empty: "Akkauntlar topilmadi",
      teacher: "O'qituvchi",
      student: "O'quvchi",
      parent: "Ota-ona",
      branch: "Filial",
      password: "Yangi parol",
      generate: "Avto",
      save: "Saqlash",
      saved: "Parol yangilandi",
      note: "Xavfsizlik sababli eski parol ko'rsatilmaydi. Bu yerda faqat yangi parol beriladi.",
    };
    const ru: Record<string, string> = {
      title: "Аккаунты",
      description: "Доступы учителей, учеников и родителей",
      teachers: "Учителя",
      students: "Ученики",
      parents: "Родители",
      all: "Все",
      search: "Поиск по имени или телефону",
      empty: "Аккаунты не найдены",
      teacher: "Учитель",
      student: "Ученик",
      parent: "Родитель",
      branch: "Филиал",
      password: "Новый пароль",
      generate: "Авто",
      save: "Сохранить",
      saved: "Пароль обновлён",
      note: "Старый пароль не показывается по безопасности. Здесь можно только выдать новый пароль.",
    };
    return (lang === "uz" ? uz : ru)[key] ?? key;
  };

  const savePassword = (row: AccountRow) => {
    const password = drafts[`${row.type}-${row.id}`]?.trim();
    if (!password || password.length < 6) return;
    if (row.type === "teacher") updateStaff(row.id, { password });
    if (row.type === "student") updateStudentPasswords(row.id, password);
    if (row.type === "parent") updateParentPassword(row.id, password);
    toast.success(t("saved"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell title={t("title")} subtitle={t("description")}>
      <div className="space-y-4">
        <Card className="p-4 border-blue-500/20 bg-blue-500/5">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{t("note")}</p>
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiCard label={t("teachers")} value={rows.filter((r) => r.type === "teacher").length} icon={GraduationCap} iconColor="blue" />
          <KpiCard label={t("students")} value={rows.filter((r) => r.type === "student").length} icon={Users} iconColor="green" />
          <KpiCard label={t("parents")} value={rows.filter((r) => r.type === "parent").length} icon={UserCog} iconColor="violet" />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="pl-9" />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="all">{t("all")} ({rows.length})</TabsTrigger>
              <TabsTrigger value="teacher">{t("teachers")} ({rows.filter((r) => r.type === "teacher").length})</TabsTrigger>
              <TabsTrigger value="student">{t("students")} ({rows.filter((r) => r.type === "student").length})</TabsTrigger>
              <TabsTrigger value="parent">{t("parents")} ({rows.filter((r) => r.type === "parent").length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">{t("empty")}</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((row) => {
              const key = `${row.type}-${row.id}`;
              return (
                <Card key={key} className="space-y-4 p-4 shadow-elegant">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-sm font-bold text-primary">
                      {row.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{row.fullName}</div>
                      <div className="text-sm text-muted-foreground">{row.phone}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{t(row.type)}</Badge>
                        {row.branchId && <Badge variant="secondary">{branchById[row.branchId] ?? t("branch")}</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("password")}</div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={visible[key] ? "text" : "password"}
                          value={drafts[key] ?? ""}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={lang === "uz" ? "Yangi parol" : "Новый пароль"}
                          className="pr-9"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setVisible((prev) => ({ ...prev, [key]: !prev[key] }))}
                        >
                          {visible[key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <Button variant="outline" size="icon" onClick={() => setDrafts((prev) => ({ ...prev, [key]: makePassword() }))}>
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button size="icon" onClick={() => savePassword(row)} disabled={!drafts[key]?.trim() || (drafts[key]?.trim().length ?? 0) < 6}>
                        <Save className="size-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

void KeyRound;
void ShieldCheck;
