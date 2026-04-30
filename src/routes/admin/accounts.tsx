import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KeyRound, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { PasswordInput } from "@/components/edu/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data/store";
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
  const { staff, students, parents, branches, updateStaff, updateStudent, updateParentPassword } = useData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | AccountType>("all");
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const branchById = useMemo(() => Object.fromEntries(branches.map((branch) => [branch.id, branch.name])), [branches]);

  const rows = useMemo<AccountRow[]>(() => {
    const teachers = staff
      .filter((member) => member.role === "teacher")
      .map((member) => ({
        id: member.id,
        type: "teacher" as const,
        fullName: member.fullName,
        phone: member.phone,
        branchId: member.branchId,
        ref: member,
      }));

    const studentRows = students.map((student) => ({
      id: student.id,
      type: "student" as const,
      fullName: student.fullName,
      phone: student.phone,
      branchId: student.branchId,
      ref: student,
    }));

    const parentRows = parents.map((parent) => ({
      id: parent.id,
      userId: parent.userId,
      type: "parent" as const,
      fullName: parent.fullName,
      phone: parent.phone,
      ref: parent,
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

  const savePassword = () => {
    if (!editing || newPassword.trim().length < 8) {
      toast.error("Parol kamida 8 ta belgi bo'lishi kerak");
      return;
    }
    const password = newPassword.trim();
    if (editing.type === "teacher") updateStaff(editing.id, { password });
    if (editing.type === "student") updateStudent(editing.id, { password });
    if (editing.type === "parent") updateParentPassword(editing.id, password);
    toast.success("Parol yangilandi");
    setEditing(null);
    setNewPassword("");
  };

  return (
    <>
      <PageHeader
        title="Доступы"
        description="Создание и безопасный сброс паролей без показа текущего пароля"
      />
      <div className="space-y-4 p-4 md:p-8">
        <div className="grid gap-3 md:grid-cols-3">
          <AccessStat label="Учителя" value={rows.filter((row) => row.type === "teacher").length} />
          <AccessStat label="Ученики" value={rows.filter((row) => row.type === "student").length} />
          <AccessStat label="Родители" value={rows.filter((row) => row.type === "parent").length} />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по имени или телефону"
                className="pl-9"
              />
            </div>
            <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="all">Все</TabsTrigger>
                <TabsTrigger value="teacher">Учителя</TabsTrigger>
                <TabsTrigger value="student">Ученики</TabsTrigger>
                <TabsTrigger value="parent">Родители</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">Нет учетных записей</div>
            ) : (
              filtered.map((row) => (
                <div key={`${row.type}-${row.id}`} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.8fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-xs font-semibold text-primary">
                        {row.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.phone}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">{roleLabel(row.type)}</Badge>
                    {row.branchId && <span className="text-xs text-muted-foreground">{branchById[row.branchId] ?? "Филиал"}</span>}
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Пароль скрыт. Доступен только сброс.
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setEditing(row);
                      setNewPassword("");
                    }}
                  >
                    <KeyRound className="size-4" /> Сбросить пароль
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить пароль</DialogTitle>
            <DialogDescription>
              {editing?.fullName}. После сохранения старый пароль перестанет работать.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Новый пароль</Label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            <Button onClick={savePassword}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function roleLabel(type: AccountType) {
  if (type === "teacher") return "Учитель";
  if (type === "student") return "Ученик";
  return "Родитель";
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
