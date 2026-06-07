import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/courses")({ component: DirectorCoursesPage });

function DirectorCoursesPage() {
  const { lang } = useI18n();
  const { courses, groups, addCourse, updateCourse, deleteCourse, isLoading } = useData();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) =>
      [course.name, course.description ?? ""].some((value) => value.toLowerCase().includes(query)),
    );
  }, [courses, search]);

  const courseStats = useMemo(() => {
    return Object.fromEntries(
      courses.map((course) => {
        const courseGroups = groups.filter((group) => group.courseId === course.id);
        const studentsCount = courseGroups.reduce((sum, group) => sum + group.studentIds.length, 0);
        return [course.id, { groupsCount: courseGroups.length, studentsCount }];
      }),
    );
  }, [courses, groups]);

  const editingCourse = editingCourseId ? courses.find((course) => course.id === editingCourseId) : null;
  const deletingCourse = deleteCourseId ? courses.find((course) => course.id === deleteCourseId) : null;

  const resetForm = () => {
    setEditingCourseId(null);
    setName("");
    setDescription("");
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (course: { id: string; name: string; description?: string }) => {
    setEditingCourseId(course.id);
    setName(course.name);
    setDescription(course.description ?? "");
    setOpen(true);
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(lang === "uz" ? "Kurs nomini kiriting" : "Введите название курса");
      return;
    }

    const duplicate = courses.some(
      (course) => course.id !== editingCourseId && course.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      toast.error(lang === "uz" ? "Bu nomdagi kurs allaqachon mavjud" : "Курс с таким названием уже существует");
      return;
    }

    if (editingCourseId) {
      updateCourse(editingCourseId, { name: trimmedName, description: description.trim() || "" });
      toast.success(lang === "uz" ? "Kurs yangilandi" : "Курс обновлён");
    } else {
      addCourse({ name: trimmedName, description: description.trim() || undefined });
      toast.success(lang === "uz" ? "Kurs yaratildi" : "Курс создан");
    }
    resetForm();
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deletingCourse) return;
    const stats = courseStats[deletingCourse.id] ?? { groupsCount: 0, studentsCount: 0 };
    if (stats.groupsCount > 0) {
      toast.error(lang === "uz" ? "Bu kursda guruhlar bor. Avval guruhlarni boshqa kursga o'tkazing yoki o'chiring." : "В этом курсе есть группы. Сначала перенесите или удалите группы.");
      setDeleteCourseId(null);
      return;
    }
    deleteCourse(deletingCourse.id);
    toast.success(lang === "uz" ? "Kurs o'chirildi" : "Курс удалён");
    setDeleteCourseId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title={lang === "uz" ? "Kurslar" : "Курсы"}
      subtitle={lang === "uz" ? "Muassasa bo'yicha barcha o'quv yo'nalishlarini direktor yaratadi va boshqaradi" : "Директор создаёт и управляет всеми учебными направлениями учреждения"}
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={openCreate}>
          <Plus className="size-3.5" /> {lang === "uz" ? "Kurs qo'shish" : "Добавить курс"}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiCard label={lang === "uz" ? "Jami kurslar" : "Всего курсов"} value={courses.length} icon={BookOpen} iconColor="blue" />
          <KpiCard label={lang === "uz" ? "Faol guruhlar" : "Активные группы"} value={groups.length} icon={Layers} iconColor="green" />
          <KpiCard
            label={lang === "uz" ? "Kursga bog'langan o'quvchilar" : "Учеников на курсах"}
            value={groups.reduce((sum, group) => sum + group.studentIds.length, 0)}
            icon={Plus}
            iconColor="violet"
          />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{lang === "uz" ? "Kurslar ro'yxati" : "Список курсов"}</h2>
              <p className="text-sm text-muted-foreground">{lang === "uz" ? "Kurs yaratilgandan keyin administratorlar shu kurs asosida guruh ochadi." : "После создания курса администраторы открывают группы на его основе."}</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={lang === "uz" ? "Kurs qidirish..." : "Поиск курса..."} className="pl-9" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <BookOpen className="size-7" />
              </div>
              <h3 className="mt-4 font-semibold">{lang === "uz" ? "Hali kurs yo'q" : "Курсов пока нет"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{lang === "uz" ? "Birinchi kursni yarating: masalan English A1, Math Foundation yoki IELTS." : "Создайте первый курс: например English A1, Math Foundation или IELTS."}</p>
              <Button onClick={openCreate} className="mt-4 gap-2">
                <Plus className="size-4" /> {lang === "uz" ? "Kurs qo'shish" : "Добавить курс"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((course) => {
                const stats = courseStats[course.id] ?? { groupsCount: 0, studentsCount: 0 };
                return (
                  <div key={course.id} className="rounded-2xl border border-border bg-background/70 p-4 transition hover:border-primary/40 hover:shadow-elegant">
                    <div className="flex items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <BookOpen className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{course.name}</h3>
                        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                          {course.description || (lang === "uz" ? "Tavsif kiritilmagan" : "Описание не указано")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" variant="ghost" size="icon" className="size-8" title={lang === "uz" ? "Kursni tahrirlash" : "Редактировать курс"} onClick={() => openEdit(course)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title={lang === "uz" ? "Kursni o'chirish" : "Удалить курс"}
                          onClick={() => setDeleteCourseId(course.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Guruhlar" : "Группы"}</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{stats.groupsCount}</div>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "O'quvchilar" : "Ученики"}</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{stats.studentsCount}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCourse ? (lang === "uz" ? "Kursni tahrirlash" : "Редактировать курс") : (lang === "uz" ? "Kurs qo'shish" : "Добавить курс")}</DialogTitle>
            <DialogDescription>
              {lang === "uz" ? "Direktor kurs nomi va tavsifini boshqaradi. Guruh, o'qituvchi, xona va jadval alohida belgilanadi." : "Директор управляет названием и описанием курса. Группа, учитель, кабинет и расписание задаются отдельно."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Kurs nomi" : "Название курса"} *</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={lang === "uz" ? "Masalan: English A1" : "Например: English A1"} autoFocus />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Tavsif" : "Описание"}</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={lang === "uz" ? "Kurs maqsadi, darajasi yoki davomiyligi haqida qisqa yozing" : "Кратко опишите цель, уровень или продолжительность курса"}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{lang === "uz" ? "Bekor qilish" : "Отмена"}</Button>
            <Button onClick={submit}>{editingCourse ? (lang === "uz" ? "Saqlash" : "Сохранить") : (lang === "uz" ? "Yaratish" : "Создать")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCourseId} onOpenChange={(nextOpen) => !nextOpen && setDeleteCourseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "uz" ? "Kurs o'chirilsinmi?" : "Удалить курс?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCourse
                ? (lang === "uz"
                    ? `"${deletingCourse.name}" kursi o'chiriladi. Guruhlarga bog'langan kurslarni o'chirish mumkin emas.`
                    : `Курс "${deletingCourse.name}" будет удалён. Курсы с привязанными группами удалить нельзя.`)
                : (lang === "uz" ? "Tanlangan kurs o'chiriladi." : "Выбранный курс будет удалён.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "uz" ? "Bekor qilish" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "uz" ? "O'chirish" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
