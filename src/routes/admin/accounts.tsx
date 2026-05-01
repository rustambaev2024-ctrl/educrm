import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShieldCheck, Search } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Badge } from "@/components/ui/badge";
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

function AccountsPage() {
  const { staff, students, parents, branches } = useData();
  const { lang } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | AccountType>("all");

  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches]);

  const rows = useMemo<AccountRow[]>(() => {
    const teachers = staff
      .filter((m) => m.role === "teacher")
      .map((m) => ({ id: m.id, type: "teacher" as const, fullName: m.fullName, phone: m.phone, branchId: m.branchId, ref: m }));

    const studentRows = students.map((s) => ({
      id: s.id, type: "student" as const, fullName: s.fullName, phone: s.phone, branchId: s.branchId, ref: s,
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
      description: "Barcha foydalanuvchilar ro'yxati va ularning rollari",
      teachers: "O'qituvchilar",
      students: "O'quvchilar",
      parents: "Ota-onalar",
      all: "Barchasi",
      search: "Ism yoki telefon bo'yicha qidirish",
      empty: "Akkauntlar topilmadi",
      passwordHidden: "Parol maxfiy saqlangan",
      teacher: "O'qituvchi",
      student: "O'quvchi",
      parent: "Ota-ona",
      branch: "Filial",
    };
    const ru: Record<string, string> = {
      title: "Доступы",
      description: "Список всех пользователей и их ролей",
      teachers: "Учителя",
      students: "Ученики",
      parents: "Родители",
      all: "Все",
      search: "Поиск по имени или телефону",
      empty: "Нет учетных записей",
      passwordHidden: "Пароль надёжно скрыт",
      teacher: "Учитель",
      student: "Ученик",
      parent: "Родитель",
      branch: "Филиал",
    };
    return (lang === "uz" ? uz : ru)[key] ?? key;
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-4 p-4 md:p-8">
        <div className="grid gap-3 md:grid-cols-3">
          <AccessStat label={t("teachers")} value={rows.filter((r) => r.type === "teacher").length} />
          <AccessStat label={t("students")} value={rows.filter((r) => r.type === "student").length} />
          <AccessStat label={t("parents")} value={rows.filter((r) => r.type === "parent").length} />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                className="pl-9"
              />
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="all">{t("all")}</TabsTrigger>
                <TabsTrigger value="teacher">{t("teachers")}</TabsTrigger>
                <TabsTrigger value="student">{t("students")}</TabsTrigger>
                <TabsTrigger value="parent">{t("parents")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">{t("empty")}</div>
            ) : (
              filtered.map((row) => (
                <div key={`${row.type}-${row.id}`} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.8fr_1fr] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-xs font-semibold text-primary">
                        {row.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.phone}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(row.type)}</Badge>
                    {row.branchId && <span className="text-xs text-muted-foreground">{branchById[row.branchId] ?? t("branch")}</span>}
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    🔒 {t("passwordHidden")}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function AccessStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <ShieldCheck className="size-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}
