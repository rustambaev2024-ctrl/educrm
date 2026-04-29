import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Layers, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data/store";

export const Route = createFileRoute("/director/courses")({ component: DirectorCoursesPage });

function DirectorCoursesPage() {
  const { courses, groups, addCourse } = useData();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
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

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Kurs nomini kiriting");
      return;
    }

    const duplicate = courses.some((course) => course.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      toast.error("Bu nomdagi kurs allaqachon mavjud");
      return;
    }

    addCourse({ name: trimmedName, description: description.trim() || undefined });
    toast.success("Kurs yaratildi");
    setName("");
    setDescription("");
    setOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Kurslar"
        description="Muassasa bo'yicha barcha o'quv yo'nalishlarini direktor yaratadi va boshqaradi"
        actions={
          <Button onClick={() => setOpen(true)} className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="size-4" /> Kurs qo'shish
          </Button>
        }
      />

      <div className="space-y-5 p-4 md:p-8">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Jami kurslar" value={courses.length} icon={BookOpen} />
          <MetricCard label="Faol guruhlar" value={groups.length} icon={Layers} />
          <MetricCard
            label="Kursga bog'langan o'quvchilar"
            value={groups.reduce((sum, group) => sum + group.studentIds.length, 0)}
            icon={Plus}
          />
        </div>

        <Card className="overflow-hidden shadow-elegant">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Kurslar ro'yxati</h2>
              <p className="text-sm text-muted-foreground">Kurs yaratilgandan keyin administratorlar shu kurs asosida guruh ochadi.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kurs qidirish..." className="pl-9" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <BookOpen className="size-7" />
              </div>
              <h3 className="mt-4 font-semibold">Hali kurs yo'q</h3>
              <p className="mt-1 text-sm text-muted-foreground">Birinchi kursni yarating: masalan English A1, Math Foundation yoki IELTS.</p>
              <Button onClick={() => setOpen(true)} className="mt-4 gap-2">
                <Plus className="size-4" /> Kurs qo'shish
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
                          {course.description || "Tavsif kiritilmagan"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Guruhlar</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{stats.groupsCount}</div>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">O'quvchilar</div>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kurs qo'shish</DialogTitle>
            <DialogDescription>
              Bu yerda faqat o'quv yo'nalishi yaratiladi. Guruh, o'qituvchi, xona va jadval keyingi bosqichda belgilanadi.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Kurs nomi *</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Masalan: English A1" autoFocus />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Tavsif</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Kurs maqsadi, darajasi yoki davomiyligi haqida qisqa yozing"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button onClick={submit}>Yaratish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BookOpen }) {
  return (
    <Card className="flex items-center justify-between p-5 shadow-elegant">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      </div>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="size-5" />
      </div>
    </Card>
  );
}
