import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GraduationCap, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supportTeacherApi } from "@/lib/api";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

interface LinkRaw {
  id: string;
  support_teacher: string;
  support_teacher_name: string;
  teacher: string;
  teacher_name: string;
  groups: { id: string; name: string }[];
  created_at: string;
}

export function SupportTeacherLinks() {
  const { lang } = useI18n();
  const { staff } = useData();

  const supportTeachers = useMemo(() => staff.filter((s) => s.role === "support_teacher"), [staff]);
  const teachers = useMemo(() => staff.filter((s) => s.role === "teacher"), [staff]);

  const [links, setLinks] = useState<LinkRaw[]>([]);
  const [loading, setLoading] = useState(false);
  // Выбранный учитель для добавления, по support_teacher userId
  const [picker, setPicker] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await supportTeacherApi.links.list()) as LinkRaw[];
      setLinks(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error("[support-teacher-links] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const linksBySupport = useMemo(() => {
    const map: Record<string, LinkRaw[]> = {};
    for (const link of links) {
      (map[link.support_teacher] ??= []).push(link);
    }
    return map;
  }, [links]);

  const attach = async (supportUserId: string) => {
    const teacherId = picker[supportUserId];
    if (!teacherId) return;
    setSaving(true);
    try {
      await supportTeacherApi.links.create({ support_teacher: supportUserId, teacher: teacherId });
      setPicker((prev) => ({ ...prev, [supportUserId]: "" }));
      await load();
      toast.success(lang === "uz" ? "O'qituvchi biriktirildi" : "Учитель привязан");
    } catch (err) {
      console.error("[support-teacher-links] attach failed:", err);
      toast.error(lang === "uz" ? "Biriktirishda xatolik" : "Ошибка привязки");
    } finally {
      setSaving(false);
    }
  };

  const detach = async (linkId: string) => {
    try {
      await supportTeacherApi.links.delete(linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success(lang === "uz" ? "O'qituvchi uzildi" : "Учитель отвязан");
    } catch (err) {
      console.error("[support-teacher-links] detach failed:", err);
      toast.error(lang === "uz" ? "Uzishda xatolik" : "Ошибка отвязки");
    }
  };

  if (supportTeachers.length === 0) return null;

  return (
    <Card className="overflow-hidden shadow-elegant">
      <div className="flex items-center gap-2 border-b border-border/60 p-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
          <Users className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {lang === "uz" ? "Yordamchi o'qituvchilar" : "Помощники учителей"}
          </div>
          <div className="text-xs text-muted-foreground">
            {lang === "uz"
              ? "Har bir yordamchini kerakli o'qituvchilarga biriktiring"
              : "Привяжите каждого помощника к нужным учителям"}
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {supportTeachers.map((st) => {
          const supportUserId = st.userId ?? st.id;
          const stLinks = linksBySupport[supportUserId] ?? [];
          // link.teacher — это Staff.id (FK на staff.Staff)
          const linkedTeacherIds = new Set(stLinks.map((l) => l.teacher));
          const availableTeachers = teachers.filter((tch) => !linkedTeacherIds.has(tch.id));

          return (
            <div key={st.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                    {st.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{st.fullName}</div>
                    <div className="text-xs text-muted-foreground">{st.phone}</div>
                  </div>
                </div>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-600">
                  {stLinks.length} {lang === "uz" ? "o'qituvchi" : "учителей"}
                </Badge>
              </div>

              {/* Linked teachers */}
              <div className="mt-3 flex flex-wrap gap-2">
                {stLinks.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    {lang === "uz" ? "Hali o'qituvchi biriktirilmagan" : "Учителя ещё не привязаны"}
                  </span>
                )}
                {stLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 py-1 pl-2.5 pr-1 text-xs"
                  >
                    <GraduationCap className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{link.teacher_name}</span>
                    {link.groups.length > 0 && (
                      <span className="text-muted-foreground">· {link.groups.length}</span>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-6 text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {lang === "uz" ? "O'qituvchini uzish" : "Отвязать учителя"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {st.fullName} — {link.teacher_name}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{lang === "uz" ? "Bekor qilish" : "Отмена"}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => detach(link.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {lang === "uz" ? "Uzish" : "Отвязать"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>

              {/* Add teacher */}
              <div className="mt-3 flex items-center gap-2">
                <Select
                  value={picker[supportUserId] ?? ""}
                  onValueChange={(v) => setPicker((prev) => ({ ...prev, [supportUserId]: v }))}
                  disabled={availableTeachers.length === 0}
                >
                  <SelectTrigger className="h-9 max-w-xs">
                    <SelectValue
                      placeholder={
                        availableTeachers.length === 0
                          ? lang === "uz" ? "Barcha o'qituvchilar biriktirilgan" : "Все учителя привязаны"
                          : lang === "uz" ? "O'qituvchini tanlang" : "Выберите учителя"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeachers.map((tch) => (
                      <SelectItem key={tch.id} value={tch.id}>{tch.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => attach(supportUserId)}
                  disabled={saving || !picker[supportUserId]}
                >
                  <UserPlus className="mr-1 size-4" />
                  {lang === "uz" ? "Qo'shish" : "Добавить"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
          <Plus className="mr-1 inline size-3 animate-spin" />
          {lang === "uz" ? "Yuklanmoqda..." : "Загрузка..."}
        </div>
      )}
    </Card>
  );
}
