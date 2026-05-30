import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Users, Clock, MapPin, X, UserPlus, UserMinus, Edit, Trash, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { GroupStatusBadge } from "@/components/edu/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useData } from "@/lib/data/store";
import { dayLabel, formatDate, formatMoney } from "@/lib/format";
import type { DayOfWeek, Group, ScheduleSlot, StudentStatus } from "@/lib/data/types";
import { GroupReportSheet } from "@/components/edu/group-report-sheet";

export const Route = createFileRoute("/admin/groups")({ component: GroupsPage });

const DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

function GroupsPage() {
  const { t, lang } = useI18n();
  const { groups, courses, staff, rooms, isLoading } = useData();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportGroupId, setReportGroupId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const selected = useMemo(() => groups.find((g) => g.id === selectedId) ?? null, [groups, selectedId]);
  const editGroup = useMemo(() => groups.find((g) => g.id === editId) ?? null, [groups, editId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={t("groups.title")}
        description={t("groups.subtitle")}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="bg-gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="mr-1 size-4" /> {t("groups.add")}
          </Button>
        }
      />
      <div className="space-y-4 p-4 md:p-8">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("groups.search")}
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">{t("groups.empty")}</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((g) => {
              const course = courses.find((c) => c.id === g.courseId);
              const teacher = staff.find((s) => s.id === g.teacherId);
              const room = rooms.find((r) => r.id === g.roomId);
              const fillRatio = g.studentIds.length / g.capacity;
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(g.id)}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-elegant cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{course?.name ?? "—"}</div>
                      <div className="mt-0.5 truncate text-base font-semibold group-hover:text-primary">{g.name}</div>
                    </div>
                    <GroupStatusBadge status={g.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Users className="size-3.5" /> {teacher?.fullName.split(" ")[0] ?? "—"}</div>
                    <div className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {room?.name ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.schedule.map((slot, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-foreground">
                        <Clock className="size-3" /> {dayLabel(slot.day, lang, true)} {slot.start}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end -mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); setReportGroupId(g.id); }}
                    >
                      <BarChart3 className="mr-1 h-3.5 w-3.5" />
                      {lang === "uz" ? "Hisobot" : "Отчёт"}
                    </Button>
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{g.studentIds.length} / {g.capacity}</span>
                      <span className="font-semibold">{formatMoney(g.monthlyPrice, lang)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all ${fillRatio >= 1 ? "bg-destructive" : "bg-gradient-primary"}`}
                        style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateGroupSheet open={createOpen} onOpenChange={setCreateOpen} />
      {editGroup && <EditGroupSheet group={editGroup} onClose={() => setEditId(null)} />}
      <GroupDetailSheet group={selected} onClose={() => setSelectedId(null)} onEdit={() => { setEditId(selectedId); setSelectedId(null); }} />
      <GroupReportSheet groupId={reportGroupId} onClose={() => setReportGroupId(null)} />
    </>
  );
}

function CreateGroupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useI18n();
  const { courses, staff, rooms, addGroup } = useData();
  const teachers = staff.filter((s) => s.role === "teacher");

  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [capacity, setCapacity] = useState(12);
  const [monthlyPrice, setMonthlyPrice] = useState(600000);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Record<DayOfWeek, { enabled: boolean; start: string; end: string }>>(
    () => Object.fromEntries(DAYS.map((d) => [d, { enabled: false, start: "09:00", end: "10:30" }])) as Record<DayOfWeek, { enabled: boolean; start: string; end: string }>,
  );

  useEffect(() => {
    if (!courseId && courses[0]?.id) setCourseId(courses[0].id);
  }, [courseId, courses]);

  useEffect(() => {
    if (!teacherId && teachers[0]?.id) setTeacherId(teachers[0].id);
  }, [teacherId, teachers]);

  useEffect(() => {
    if (!roomId && rooms[0]?.id) setRoomId(rooms[0].id);
  }, [roomId, rooms]);

  const submit = () => {
    const schedule: ScheduleSlot[] = DAYS.filter((d) => slots[d].enabled).map((d) => ({ day: d, start: slots[d].start, end: slots[d].end }));
    const selectedRoom = rooms.find((room) => room.id === roomId);
    if (!name.trim() || !courseId || !teacherId || !selectedRoom || schedule.length === 0) {
      toast.error(t("validation.fillAll"));
      return;
    }
    addGroup({
      name: name.trim(),
      courseId,
      branchId: selectedRoom.branchId,
      teacherId,
      roomId,
      capacity,
      monthlyPrice,
      startDate,
      schedule,
    });
    toast.success(t("groups.created"));
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("groups.add")}</SheetTitle>
          <SheetDescription>{t("groups.subtitle")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 py-6">
          <div className="space-y-2">
            <Label>{t("groups.field.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Matematika — Ertalab" autoComplete="off" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("groups.field.course")} *</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.teacher")} *</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {teachers.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.room")} *</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger><SelectValue placeholder="Kabinet tanlang" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {rooms.length === 0 && (
                <div className="text-[11px] text-destructive">Avval direktor kabinet yaratishi kerak.</div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.capacity")} *</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.startDate")} *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.price")} *</Label>
              <Input type="number" min={0} step={10000} value={monthlyPrice} onChange={(e) => setMonthlyPrice(Number(e.target.value))} autoComplete="off" />
              <div className="text-[11px] text-muted-foreground">{formatMoney(monthlyPrice, lang)}</div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("groups.field.schedule")} *</Label>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {DAYS.map((d) => {
                const s = slots[d];
                return (
                  <div key={d} className="flex items-center gap-2">
                    <label className="flex w-32 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={s.enabled}
                        onCheckedChange={(v) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], enabled: v === true } }))}
                      />
                      <span>{dayLabel(d, lang)}</span>
                    </label>
                    <Input type="time" value={s.start} disabled={!s.enabled} onChange={(e) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], start: e.target.value } }))} className="w-28" />
                    <span className="text-muted-foreground">—</span>
                    <Input type="time" value={s.end} disabled={!s.enabled} onChange={(e) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], end: e.target.value } }))} className="w-28" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} className="bg-gradient-primary text-primary-foreground">{t("common.create")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function GroupDetailSheet({ group, onClose, onEdit }: { group: Group | null; onClose: () => void; onEdit: () => void }) {
  const { t, lang } = useI18n();
  const { students, courses, staff, rooms, addStudentToGroup, removeStudentFromGroup, lessons, deleteGroup, updateGroup } = useData();
  const [studentSearch, setStudentSearch] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const open = group !== null;
  if (!group) return <Sheet open={open} onOpenChange={(v) => !v && onClose()}><SheetContent /></Sheet>;

  const course = courses.find((c) => c.id === group.courseId);
  const teacher = staff.find((s) => s.id === group.teacherId);
  const room = rooms.find((r) => r.id === group.roomId);
  const enrolled = students.filter((s) => group.studentIds.includes(s.id));
  const available = students.filter((s) => !group.studentIds.includes(s.id) && s.status !== "archived");
  const studentQuery = studentSearch.trim().toLowerCase().replace(/\s+/g, "");
  const filteredAvailable = available
    .filter((student) => {
      if (!studentQuery) return true;
      const haystack = `${student.fullName} ${student.phone} ${student.id}`.toLowerCase().replace(/\s+/g, "");
      return haystack.includes(studentQuery);
    })
    .sort((a, b) => {
      const branchDiff = Number(b.branchId === group.branchId) - Number(a.branchId === group.branchId);
      if (branchDiff !== 0) return branchDiff;
      return a.fullName.localeCompare(b.fullName);
    });
  const visibleAvailable = filteredAvailable.slice(0, 80);
  const remainingAvailable = Math.max(0, filteredAvailable.length - visibleAvailable.length);
  const groupLessons = lessons.filter((l) => l.groupId === group.id).sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  const completeGroup = () => {
    updateGroup(group.id, { status: "completed" });
    toast.success("Guruh tugallangan holatiga o'tkazildi");
  };
  const handleDeleteGroup = () => {
    if (enrolled.length > 0) {
      toast.warning("Avval guruhdagi o'quvchilarni olib tashlang.");
      return;
    }
    setConfirmDeleteOpen(true);
  };

  return (
    <>
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-left">{group.name}</SheetTitle>
            <div className="flex items-center gap-1">
              {group.status !== "completed" && (
                <Button variant="ghost" size="icon" onClick={completeGroup} className="text-muted-foreground hover:text-emerald-600" title="Guruhni tugallash">
                  <CheckCircle2 className="size-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Edit className="size-4" /></Button>
              <Button variant="ghost" size="icon" onClick={handleDeleteGroup} className="text-destructive hover:text-destructive/80"><Trash className="size-4" /></Button>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
            </div>
          </div>
          <SheetDescription className="text-left">{course?.name}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 py-6">
          <div className="flex items-center gap-3">
            <GroupStatusBadge status={group.status} />
            <div className="text-sm text-muted-foreground">{group.studentIds.length} / {group.capacity}</div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">{t("groups.field.price")}</div>
              <div className="text-lg font-semibold">{formatMoney(group.monthlyPrice, lang)}</div>
            </div>
          </div>
          <Tabs defaultValue="overview">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">{t("groups.tab.overview")}</TabsTrigger>
              <TabsTrigger value="students" className="flex-1">{t("groups.tab.students")}</TabsTrigger>
              <TabsTrigger value="lessons" className="flex-1">{t("groups.tab.lessons")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-3 pt-4">
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label={t("groups.field.teacher")} value={teacher?.fullName ?? "—"} />
                  <Field label={t("groups.field.room")} value={room?.name ?? "—"} />
                  <Field label={t("groups.field.startDate")} value={formatDate(group.startDate, lang)} />
                  <Field label={t("groups.field.capacity")} value={`${group.capacity}`} />
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("groups.field.schedule")}</div>
                <div className="mt-3 space-y-2">
                  {group.schedule.map((slot, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                      <span className="font-medium">{dayLabel(slot.day, lang)}</span>
                      <span className="tabular-nums text-muted-foreground">{slot.start} — {slot.end}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="students" className="space-y-3 pt-4">
              <Card className="divide-y divide-border">
                {enrolled.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
                ) : (
                  enrolled.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                        {s.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{s.phone}</div>
                      </div>
                      <StudentStatusInline status={s.status} />
                      <Button variant="ghost" size="sm" onClick={() => { removeStudentFromGroup(group.id, s.id); toast.success(t("groups.studentRemoved")); }}>
                        <UserMinus className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </Card>
              {group.studentIds.length < group.capacity && available.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("groups.addStudent")}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {filteredAvailable.length} ta topildi · {group.capacity - group.studentIds.length} ta joy qoldi
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="Ism, telefon yoki ID bo'yicha qidirish"
                      className="pl-9"
                    />
                  </div>
                  <Card className="max-h-80 overflow-y-auto">
                    {visibleAvailable.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        Bunday o'quvchi topilmadi.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {visibleAvailable.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              addStudentToGroup(group.id, s.id);
                              setStudentSearch("");
                              toast.success(t("groups.studentAdded"));
                            }}
                            className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40"
                          >
                            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                              {s.fullName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{s.fullName}</div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{s.phone}</span>
                                {s.branchId === group.branchId && <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">shu filial</span>}
                              </div>
                            </div>
                            <UserPlus className="size-4 text-primary" />
                          </button>
                        ))}
                        {remainingAvailable > 0 && (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            Yana {remainingAvailable} ta o'quvchi bor. Aniqroq qidiruv kiriting.
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              )}
              {group.studentIds.length >= group.capacity && (
                <Card className="p-4 text-center text-sm text-muted-foreground">
                  Guruh to'lgan. Yangi o'quvchi qo'shish uchun avval joy bo'shating yoki sig'imni oshiring.
                </Card>
              )}
              {group.studentIds.length < group.capacity && available.length === 0 && (
                <Card className="p-4 text-center text-sm text-muted-foreground">
                  Qo'shish uchun bo'sh o'quvchi yo'q.
                </Card>
              )}
            </TabsContent>
            <TabsContent value="lessons" className="space-y-2 pt-4">
              {groupLessons.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">{t("common.empty")}</Card>
              ) : (
                groupLessons.slice(0, 20).map((l) => (
                  <Card key={l.id} className="flex items-center gap-3 p-3">
                    <div className="flex size-10 flex-col items-center justify-center rounded-md bg-accent text-center">
                      <span className="text-[10px] uppercase text-muted-foreground">{new Date(l.datetime).toLocaleString(lang === "uz" ? "uz-Latn" : "ru-RU", { month: "short" })}</span>
                      <span className="text-sm font-bold leading-none">{new Date(l.datetime).getDate()}</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{new Date(l.datetime).toLocaleTimeString(lang === "uz" ? "uz-Latn" : "ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-[11px] text-muted-foreground">{l.durationMinutes} min</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${l.status === "completed" ? "bg-success/15 text-success" : l.status === "cancelled" ? "bg-destructive/15 text-destructive" : "bg-info/15 text-info"}`}>
                      {t(`lstatus.${l.status}`)}
                    </span>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Guruhni o'chirish</AlertDialogTitle>
          <AlertDialogDescription>Guruhni butunlay o'chirishni xohlaysizmi? Bu amalni qaytarib bo'lmaydi.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction onClick={() => { deleteGroup(group.id); toast.success("Guruh o'chirildi"); onClose(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            O'chirish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function StudentStatusInline({ status }: { status: StudentStatus }) {
  const { t } = useI18n();
  const tone = status === "active" ? "text-success" : status === "debtor" ? "text-destructive" : "text-muted-foreground";
  return <span className={`text-[11px] font-medium ${tone}`}>{t(`status.${status}`)}</span>;
}

function EditGroupSheet({ group, onClose }: { group: Group; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { courses, staff, rooms, updateGroup } = useData();
  const teachers = staff.filter((s) => s.role === "teacher");

  const [name, setName] = useState(group.name);
  const [courseId, setCourseId] = useState(group.courseId);
  const [teacherId, setTeacherId] = useState(group.teacherId);
  const [roomId, setRoomId] = useState(group.roomId);
  const [capacity, setCapacity] = useState(group.capacity);
  const [monthlyPrice, setMonthlyPrice] = useState(group.monthlyPrice);
  const [startDate, setStartDate] = useState(group.startDate);
  const [status, setStatus] = useState<Group["status"]>(group.status);
  const [slots, setSlots] = useState<Record<DayOfWeek, { enabled: boolean; start: string; end: string }>>(() => {
    const s = Object.fromEntries(DAYS.map((d) => [d, { enabled: false, start: "09:00", end: "10:30" }])) as Record<DayOfWeek, { enabled: boolean; start: string; end: string }>;
    group.schedule.forEach(slot => {
      s[slot.day] = { enabled: true, start: slot.start, end: slot.end };
    });
    return s;
  });

  const submit = () => {
    const schedule: ScheduleSlot[] = DAYS.filter((d) => slots[d].enabled).map((d) => ({ day: d, start: slots[d].start, end: slots[d].end }));
    if (!name.trim() || !courseId || !teacherId || !roomId || schedule.length === 0) {
      toast.error(t("validation.fillAll"));
      return;
    }
    updateGroup(group.id, {
      name: name.trim(),
      courseId,
      teacherId,
      roomId,
      capacity,
      monthlyPrice,
      startDate,
      schedule,
      status,
    });
    toast.success("Guruh yangilandi");
    onClose();
  };

  return (
    <Sheet open={true} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Guruhni tahrirlash</SheetTitle>
          <SheetDescription>Guruh ma'lumotlarini o'zgartirish</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 py-6">
          <div className="space-y-2">
            <Label>{t("groups.field.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("groups.field.course")} *</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.teacher")} *</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {teachers.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.room")} *</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Group["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recruiting">Qabul ochiq</SelectItem>
                  <SelectItem value="active">Faol</SelectItem>
                  <SelectItem value="frozen">Muzlatilgan</SelectItem>
                  <SelectItem value="completed">Tugallangan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.capacity")} *</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.startDate")} *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.price")} *</Label>
              <Input type="number" min={0} step={10000} value={monthlyPrice} onChange={(e) => setMonthlyPrice(Number(e.target.value))} autoComplete="off" />
              <div className="text-[11px] text-muted-foreground">{formatMoney(monthlyPrice, lang)}</div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("groups.field.schedule")} *</Label>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {DAYS.map((d) => {
                const s = slots[d];
                return (
                  <div key={d} className="flex items-center gap-2">
                    <label className="flex w-32 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={s.enabled}
                        onCheckedChange={(v) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], enabled: v === true } }))}
                      />
                      <span>{dayLabel(d, lang)}</span>
                    </label>
                    <Input type="time" value={s.start} disabled={!s.enabled} onChange={(e) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], start: e.target.value } }))} className="w-28" />
                    <span className="text-muted-foreground">—</span>
                    <Input type="time" value={s.end} disabled={!s.enabled} onChange={(e) => setSlots((prev) => ({ ...prev, [d]: { ...prev[d], end: e.target.value } }))} className="w-28" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} className="bg-gradient-primary text-primary-foreground">Saqlash</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
