import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { StudentDetailSheet } from "@/components/students/student-detail-sheet";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import type { Course, Group, Student } from "@/lib/data/types";

export const Route = createFileRoute("/director/courses")({ component: DirectorCoursesPage });

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600",
  "bg-emerald-500/10 text-emerald-600",
  "bg-purple-500/10 text-purple-600",
  "bg-amber-500/10 text-amber-600",
  "bg-pink-500/10 text-pink-600",
];

function DirectorCoursesPage() {
  const { lang } = useI18n();
  const { courses, groups, staff, students, payments, addCourse, updateCourse, deleteCourse, updateGroup, isLoading } = useData();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      [c.name, c.description ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [courses, search]);

  const courseStats = useMemo(
    () =>
      Object.fromEntries(
        courses.map((course) => {
          const cg = groups.filter((g) => g.courseId === course.id);
          return [course.id, { groupsCount: cg.length, studentsCount: cg.reduce((s, g) => s + g.studentIds.length, 0) }];
        }),
      ),
    [courses, groups],
  );

  const courseGroups = useMemo(
    () => (selectedCourse ? groups.filter((g) => g.courseId === selectedCourse.id) : []),
    [selectedCourse, groups],
  );

  const courseStudentIds = useMemo(
    () => new Set(courseGroups.flatMap((g) => g.studentIds)),
    [courseGroups],
  );

  const sheetStats = useMemo(() => {
    const totalStudents = courseStudentIds.size;
    const activeGroups = courseGroups.filter((g) => g.status === "active").length;
    const avgFill =
      courseGroups.length > 0
        ? Math.round(
            courseGroups.reduce((s, g) => s + (g.studentIds.length / (g.capacity || 20)) * 100, 0) /
              courseGroups.length,
          )
        : 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthIncome = payments
      .filter((p) => p.direction === "in" && courseStudentIds.has(p.studentId ?? "") && new Date(p.date) >= monthStart)
      .reduce((s, p) => s + p.amount, 0);
    return { totalStudents, activeGroups, avgFill, monthIncome };
  }, [courseGroups, courseStudentIds, payments]);

  const editingCourse = editingCourseId ? courses.find((c) => c.id === editingCourseId) : null;
  const deletingCourse = deleteCourseId ? courses.find((c) => c.id === deleteCourseId) : null;

  const resetForm = () => { setEditingCourseId(null); setName(""); setDescription(""); };
  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourseId(course.id);
    setName(course.name);
    setDescription(course.description ?? "");
    setDialogOpen(true);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(lang === "uz" ? "Kurs nomini kiriting" : "Введите название курса"); return; }
    const dup = courses.some((c) => c.id !== editingCourseId && c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (dup) { toast.error(lang === "uz" ? "Bu nomdagi kurs allaqachon mavjud" : "Курс с таким названием уже существует"); return; }
    if (editingCourseId) {
      updateCourse(editingCourseId, { name: trimmed, description: description.trim() || "" });
      toast.success(lang === "uz" ? "Kurs yanglandi" : "Курс обновлён");
    } else {
      addCourse({ name: trimmed, description: description.trim() || undefined });
      toast.success(lang === "uz" ? "Kurs yaratildi" : "Курс создан");
    }
    resetForm();
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deletingCourse) return;
    const stats = courseStats[deletingCourse.id] ?? { groupsCount: 0 };
    if (stats.groupsCount > 0) {
      toast.error(lang === "uz" ? "Bu kursda guruhlar bor. Avval guruhlarni boshqa kursga o'tkazing yoki o'chiring." : "В этом курсе есть группы. Сначала перенесите или удалите группы.");
      setDeleteCourseId(null);
      return;
    }
    deleteCourse(deletingCourse.id);
    toast.success(lang === "uz" ? "Kurs o'chirildi" : "Курс удалён");
    setDeleteCourseId(null);
  };


  return (
    <>
      <PageShell
        title={lang === "uz" ? "Kurslar" : "Курсы"}
        subtitle={
          lang === "uz"
            ? "Muassasa bo'yicha barcha o'quv yo'nalishlarini direktor yaratadi va boshqaradi"
            : "Директор создаёт и управляет всеми учебными направлениями учреждения"
        }
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
              value={groups.reduce((s, g) => s + g.studentIds.length, 0)}
              icon={Users}
              iconColor="violet"
            />
          </div>

          <Card className="overflow-hidden shadow-elegant">
            <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{lang === "uz" ? "Kurslar ro'yxati" : "Список курсов"}</h2>
                <p className="text-sm text-muted-foreground">
                  {lang === "uz"
                    ? "Kurs yaratilgandan keyin administratorlar shu kurs asosida guruh ochadi."
                    : "После создания курса администраторы открывают группы на его основе."}
                </p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={lang === "uz" ? "Kurs qidirish..." : "Поиск курса..."}
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
            </div>

            {isLoading && courses.length === 0 ? (
              <CardGridSkeleton count={6} className="p-4" />
            ) : filtered.length === 0 ? (
              search.trim() ? (
                <EmptyState
                  icon={<Search className="size-7" />}
                  title={lang === "uz" ? "Hech narsa topilmadi" : "Ничего не найдено"}
                  description={lang === "uz" ? "Boshqa so'rov bilan urinib ko'ring" : "Попробуйте изменить запрос"}
                />
              ) : (
                <EmptyState
                  icon={<BookOpen className="size-7" />}
                  title={lang === "uz" ? "Hali kurs yo'q" : "Курсов пока нет"}
                  description={lang === "uz"
                    ? "Birinchi kursni yarating: masalan English A1, Math Foundation yoki IELTS."
                    : "Создайте первый курс: например English A1, Math Foundation или IELTS."}
                  action={{ label: lang === "uz" ? "Kurs qo'shish" : "Добавить курс", onClick: openCreate }}
                />
              )
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((course) => {
                  const stats = courseStats[course.id] ?? { groupsCount: 0, studentsCount: 0 };
                  return (
                    <div
                      key={course.id}
                      className="rounded-2xl border border-border bg-background/70 p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-elegant hover:-translate-y-0.5 cursor-pointer"
                      onClick={() => setSelectedCourse(course)}
                    >
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title={lang === "uz" ? "Kursni tahrirlash" : "Редактировать курс"}
                            onClick={(e) => openEdit(course, e)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            title={lang === "uz" ? "Kursni o'chirish" : "Удалить курс"}
                            onClick={(e) => { e.stopPropagation(); setDeleteCourseId(course.id); }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-muted/60 p-3">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {lang === "uz" ? "Guruhlar" : "Группы"}
                          </div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">{stats.groupsCount}</div>
                        </div>
                        <div className="rounded-xl bg-muted/60 p-3">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {lang === "uz" ? "O'quvchilar" : "Ученики"}
                          </div>
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
      </PageShell>

      {/* ── Sheet: курс → список групп ────────────────────────────── */}
      <Sheet open={!!selectedCourse} onOpenChange={(v) => { if (!v) setSelectedCourse(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[580px]">
          {selectedCourse && (
            <>
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SheetTitle className="text-xl font-bold text-foreground">
                      {selectedCourse.name}
                    </SheetTitle>
                    {selectedCourse.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{selectedCourse.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    title={lang === "uz" ? "Kursni tahrirlash" : "Редактировать курс"}
                    onClick={(e) => { openEdit(selectedCourse, e); setSelectedCourse(null); }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </SheetHeader>

              <div className="space-y-6 py-5">
                {/* KPI */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label={lang === "uz" ? "O'quvchilar" : "Студенты"} value={sheetStats.totalStudents} icon={Users} iconColor="blue" />
                  <KpiCard label={lang === "uz" ? "Faol guruhlar" : "Активных групп"} value={sheetStats.activeGroups} icon={Layers} iconColor="green" />
                  <KpiCard label={lang === "uz" ? "To'ldirilganlik" : "Заполненность"} value={`${sheetStats.avgFill}%`} icon={TrendingUp} iconColor="cyan" />
                  <KpiCard label={lang === "uz" ? "Oylik daromad" : "Доход/мес"} value={formatMoney(sheetStats.monthIncome, lang)} icon={DollarSign} iconColor="amber" />
                </div>

                {/* Группы */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Layers className="size-4 text-primary" />
                    {lang === "uz" ? "Guruhlar" : "Группы"}
                    <span className="font-normal text-muted-foreground">({courseGroups.length})</span>
                  </h3>
                  {courseGroups.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {lang === "uz" ? "Guruhlar yo'q" : "Групп нет"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {courseGroups.map((group) => {
                        const teacher = staff.find((s) => s.id === group.teacherId);
                        return (
                          <div
                            key={group.id}
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
                            onClick={() => setSelectedGroup(group)}
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Layers className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    group.status === "active"
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : group.status === "completed"
                                      ? "bg-blue-500/10 text-blue-600"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {group.status === "active"
                                    ? lang === "uz" ? "Faol" : "Активная"
                                    : group.status === "completed"
                                    ? lang === "uz" ? "Tugallangan" : "Завершена"
                                    : lang === "uz" ? "Nofaol" : "Неактивная"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{teacher?.fullName ?? (lang === "uz" ? "O'qituvchi yo'q" : "Без учителя")}</span>
                                <span>·</span>
                                <span>{group.studentIds.length}/{group.capacity ?? "?"} {lang === "uz" ? "o'quvchi" : "студентов"}</span>
                                {group.monthlyPrice > 0 && (<><span>·</span><span>{formatMoney(group.monthlyPrice, lang)}</span></>)}
                              </div>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Sheet: группа → список студентов ─────────────────────── */}
      <Sheet open={!!selectedGroup} onOpenChange={(v) => { if (!v) setSelectedGroup(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
          {selectedGroup && (() => {
            const groupStudents = students.filter((s) => selectedGroup.studentIds.includes(s.id));
            const teacher = staff.find((s) => s.id === selectedGroup.teacherId);

            return (
              <>
                <SheetHeader className="border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedGroup(null)}
                      className="flex size-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <div>
                      <SheetTitle className="text-lg font-bold text-foreground">
                        {selectedGroup.name}
                      </SheetTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">{selectedCourse?.name}</p>
                    </div>
                  </div>
                </SheetHeader>

                <div className="space-y-4 py-4">
                  {/* Инфо группы */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {lang === "uz" ? "O'qituvchi" : "Учитель"}
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {teacher?.fullName ?? (lang === "uz" ? "Belgilanmagan" : "Не назначен")}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {lang === "uz" ? "Holati" : "Статус"}
                        </div>
                        <Select
                          value={selectedGroup.status}
                          onValueChange={(v) => {
                            updateGroup(selectedGroup.id, { status: v as typeof selectedGroup.status });
                            toast.success(lang === "uz" ? "Holat yangilandi" : "Статус обновлён");
                          }}
                        >
                          <SelectTrigger className="h-7 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recruiting">{lang === "uz" ? "Qabul ochiq" : "Набор открыт"}</SelectItem>
                            <SelectItem value="active">{lang === "uz" ? "Faol" : "Активная"}</SelectItem>
                            <SelectItem value="frozen">{lang === "uz" ? "Muzlatilgan" : "Заморожена"}</SelectItem>
                            <SelectItem value="completed">{lang === "uz" ? "Tugallangan" : "Завершена"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {lang === "uz" ? "Narx" : "Цена"}
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          {formatMoney(selectedGroup.monthlyPrice || 0, lang)}
                          {lang === "uz" ? "/oy" : "/мес"}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {lang === "uz" ? "O'quvchilar" : "Студентов"}
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {groupStudents.length}
                          {selectedGroup.capacity ? ` / ${selectedGroup.capacity}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Список студентов */}
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Users className="size-4 text-primary" />
                      {lang === "uz" ? "O'quvchilar" : "Студенты"}
                      <span className="font-normal text-muted-foreground">({groupStudents.length})</span>
                    </h3>

                    {groupStudents.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {lang === "uz" ? "Bu guruhda hali o'quvchilar yo'q" : "В этой группе пока нет студентов"}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {groupStudents.map((student) => {
                          const colorClass = AVATAR_COLORS[(student.fullName.charCodeAt(0) || 0) % AVATAR_COLORS.length];
                          return (
                            <div
                              key={student.id}
                              className="flex cursor-pointer items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/40"
                              onClick={() => setSelectedStudent(student)}
                            >
                              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorClass}`}>
                                {initialsOf(student.fullName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">{student.fullName}</div>
                                <div className="text-xs text-muted-foreground">{student.phone}</div>
                              </div>
                              <span className={`shrink-0 text-sm font-semibold tabular-nums ${student.balance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                {formatMoney(student.balance, lang)}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  student.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : student.status === "frozen"
                                    ? "bg-amber-500/10 text-amber-600"
                                    : student.status === "expelled"
                                    ? "bg-red-500/10 text-red-600"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {student.status === "active"
                                  ? lang === "uz" ? "Faol" : "Активный"
                                  : student.status === "frozen"
                                  ? lang === "uz" ? "Muzlatilgan" : "Заморожен"
                                  : student.status === "expelled"
                                  ? lang === "uz" ? "Chiqarilgan" : "Отчислен"
                                  : lang === "uz" ? "Arxiv" : "Архив"}
                              </span>
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Student detail sheet */}
      {selectedStudent && (
        <StudentDetailSheet
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onArchive={() => setSelectedStudent(null)}
          onDelete={() => setSelectedStudent(null)}
        />
      )}

      {/* Диалог создания / редактирования */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCourse
                ? lang === "uz" ? "Kursni tahrirlash" : "Редактировать курс"
                : lang === "uz" ? "Kurs qo'shish" : "Добавить курс"}
            </DialogTitle>
            <DialogDescription>
              {lang === "uz"
                ? "Direktor kurs nomi va tavsifini boshqaradi. Guruh, o'qituvchi, xona va jadval alohida belgilanadi."
                : "Директор управляет названием и описанием курса. Группа, учитель, кабинет и расписание задаются отдельно."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                {lang === "uz" ? "Kurs nomi" : "Название курса"} *
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "uz" ? "Masalan: English A1" : "Например: English A1"} autoComplete="off" autoFocus />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                {lang === "uz" ? "Tavsif" : "Описание"}
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={lang === "uz" ? "Kurs maqsadi, darajasi yoki davomiyligi haqida qisqa yozing" : "Кратко опишите цель, уровень или продолжительность курса"}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{lang === "uz" ? "Bekor qilish" : "Отмена"}</Button>
            <Button onClick={submit}>{editingCourse ? (lang === "uz" ? "Saqlash" : "Сохранить") : (lang === "uz" ? "Yaratish" : "Создать")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCourseId} onOpenChange={(v) => !v && setDeleteCourseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "uz" ? "Kurs o'chirilsinmi?" : "Удалить курс?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCourse
                ? lang === "uz"
                  ? `"${deletingCourse.name}" kursi o'chiriladi. Guruhlarga bog'langan kurslarni o'chirish mumkin emas.`
                  : `Курс "${deletingCourse.name}" будет удалён. Курсы с привязанными группами удалить нельзя.`
                : lang === "uz" ? "Tanlangan kurs o'chiriladi." : "Выбранный курс будет удалён."}
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
    </>
  );
}
