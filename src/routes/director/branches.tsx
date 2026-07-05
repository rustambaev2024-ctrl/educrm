import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, DoorOpen, GripVertical, Layers, MapPin, Pencil, Plus, Trash2, Users, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { KpiCard } from "@/components/edu/kpi-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { branchApi, ApiError } from "@/lib/api";
import type { Branch, Room } from "@/lib/data/types";

export const Route = createFileRoute("/director/branches")({ component: BranchesPage });

function BranchesPage() {
  const { t, lang } = useI18n();
  const {
    branches, rooms, staff, students, groups,
    addRoom, updateRoom, deleteRoom,
    addBranch, updateBranch, deleteBranch,
    isLoading,
  } = useData();
  const [openRoom, setOpenRoom] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [openBranch, setOpenBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [forceDeleteBranch, setForceDeleteBranch] = useState<Branch | null>(null);
  const [activeCounts, setActiveCounts] = useState<{ students: number; staff: number; groups: number } | null>(null);

  const openCreateBranch = () => {
    setEditingBranch(null);
    setOpenBranch(true);
  };

  const openEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setOpenBranch(true);
  };

  const confirmDeleteBranch = async () => {
    if (!deletingBranch) return;
    try {
      await branchApi.delete(deletingBranch.id);
      deleteBranch(deletingBranch.id);
      toast.success(lang === "uz" ? "Filial o'chirildi" : "Филиал удалён");
      setDeletingBranch(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.body?.active_counts) {
        const counts = e.body.active_counts as { students: number; staff: number; groups: number };
        setActiveCounts(counts);
        setForceDeleteBranch(deletingBranch);
        setDeletingBranch(null);
      } else {
        toast.error(lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка");
        setDeletingBranch(null);
      }
    }
  };

  const confirmForceDeleteBranch = async () => {
    if (!forceDeleteBranch) return;
    try {
      await branchApi.deleteForce(forceDeleteBranch.id);
      deleteBranch(forceDeleteBranch.id);
      toast.success(lang === "uz" ? "Filial o'chirildi" : "Филиал удалён");
    } catch {
      toast.error(lang === "uz" ? "Xatolik yuz berdi" : "Произошла ошибка");
    } finally {
      setForceDeleteBranch(null);
      setActiveCounts(null);
    }
  };

  const stats = useMemo(() => {
    return branches.map((branch) => {
      const branchRooms = rooms.filter((room) => room.branchId === branch.id);
      const branchStaff = staff.filter((member) => member.branchId === branch.id);
      const branchStudents = students.filter((student) => student.branchId === branch.id);
      const branchGroups = groups.filter((group) => group.branchId === branch.id);
      const totalCapacity = branchRooms.reduce((sum, room) => sum + room.capacity, 0);
      return { branch, rooms: branchRooms, staff: branchStaff, students: branchStudents, groups: branchGroups, capacity: totalCapacity };
    });
  }, [branches, groups, rooms, staff, students]);

  const moveRoomToBranch = (branchId: string) => {
    if (!draggedRoomId) return;
    const room = rooms.find((item) => item.id === draggedRoomId);
    if (!room || room.branchId === branchId) return;
    updateRoom(room.id, { branchId });
    toast.success("Kabinet boshqa filialga ko'chirildi");
    setDraggedRoomId(null);
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
      title={t("branches.title")}
      subtitle={lang === "uz" ? "Filiallar, kabinetlar va ularning yuklamasini boshqarish" : "Управление филиалами, кабинетами и их загрузкой"}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={openCreateBranch}>
            <Plus className="size-3.5" /> {lang === "uz" ? "Yangi filial" : "Новый филиал"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-[12px]" onClick={() => setOpenRoom(true)}>
            <Plus className="size-3.5" /> {lang === "uz" ? "Kabinet qo'shish" : "Добавить кабинет"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("branches.title")} value={branches.length} icon={Building2} iconColor="blue" />
          <KpiCard label={lang === "uz" ? "Xonalar" : "Кабинеты"} value={rooms.length} icon={DoorOpen} iconColor="green" />
          <KpiCard label={t("branches.col.students")} value={students.length} icon={Users} iconColor="violet" />
          <KpiCard label={t("nav.staff")} value={staff.length} icon={Briefcase} iconColor="amber" />
        </div>
        {stats.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <Building2 className="size-10 opacity-30" />
            <div>{lang === "uz" ? "Avval filial yarating. Keyin kabinet qo'shish mumkin bo'ladi." : "Сначала создайте филиал. Затем можно будет добавлять кабинеты."}</div>
            <Button className="gap-2" onClick={openCreateBranch}>
              <Plus className="size-4" /> {lang === "uz" ? "Yangi filial" : "Новый филиал"}
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {stats.map(({ branch, rooms: branchRooms, staff: branchStaff, students: branchStudents, groups: branchGroups, capacity }) => (
                <Card key={branch.id} className="overflow-hidden p-0 shadow-elegant">
                  <div className="bg-gradient-primary p-5 text-primary-foreground">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-5" />
                          <h3 className="truncate text-lg font-semibold">{branch.name}</h3>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-sm opacity-90">
                          <MapPin className="size-3.5" />
                          <span className="truncate">{branch.address}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge className="bg-white/20 text-primary-foreground hover:bg-white/30">{branchRooms.length} {lang === "uz" ? "kabinet" : "каб."}</Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-primary-foreground hover:bg-white/20"
                          title={lang === "uz" ? "Tahrirlash" : "Изменить"}
                          onClick={() => openEditBranch(branch)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-primary-foreground hover:bg-white/20"
                          title={lang === "uz" ? "O'chirish" : "Удалить"}
                          onClick={() => setDeletingBranch(branch)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
                    <Mini icon={Users} value={`${branchStudents.length}`} label={t("branches.col.students")} />
                    <Mini icon={Layers} value={`${branchGroups.length}`} label={t("branches.col.groups")} />
                    <Mini icon={DoorOpen} value={`${capacity}`} label={t("branches.field.capacity")} />
                    <Mini icon={Users} value={`${branchStaff.length}`} label={t("branches.col.staff")} />
                  </div>
                </Card>
              ))}
            </div>

            <Card className="overflow-hidden shadow-elegant">
              <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{lang === "uz" ? "Kabinetlar doskasi" : "Доска кабинетов"}</h2>
                  <p className="text-sm text-muted-foreground">{lang === "uz" ? "Kabinet kartasini ushlab boshqa filial ustuniga olib o'tish mumkin." : "Карточку кабинета можно перетащить в колонку другого филиала."}</p>
                </div>
                <Button variant="outline" onClick={() => setOpenRoom(true)} className="gap-2">
                  <Plus className="size-4" /> {lang === "uz" ? "Kabinet qo'shish" : "Добавить кабинет"}
                </Button>
              </div>

              <div className="grid gap-4 overflow-x-auto p-4 lg:grid-cols-2 xl:grid-cols-3">
                {branches.map((branch) => (
                  <RoomColumn
                    key={branch.id}
                    branch={branch}
                    rooms={rooms.filter((room) => room.branchId === branch.id)}
                    groups={groups}
                    draggedRoomId={draggedRoomId}
                    onDragStart={setDraggedRoomId}
                    onDrop={moveRoomToBranch}
                    onDelete={(room) => {
                      const used = groups.some((group) => group.roomId === room.id);
                      if (used) {
                        toast.error(lang === "uz" ? "Bu kabinet guruhga biriktirilgan. Avval guruhni boshqa kabinetga o'tkazing." : "Этот кабинет привязан к группе. Сначала перенесите группу в другой кабинет.");
                        return;
                      }
                      deleteRoom(room.id);
                      toast.success(lang === "uz" ? "Kabinet o'chirildi" : "Кабинет удалён");
                    }}
                  />
                ))}
              </div>
            </Card>
          </>
        )}
      </div>

      <CreateRoomDialog open={openRoom} onOpenChange={setOpenRoom} branches={branches} onCreate={addRoom} />

      <BranchDialog
        open={openBranch}
        onOpenChange={setOpenBranch}
        editing={editingBranch}
        lang={lang}
        onCreate={addBranch}
        onUpdate={updateBranch}
      />

      <AlertDialog open={!!deletingBranch} onOpenChange={(nextOpen) => !nextOpen && setDeletingBranch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "uz" ? "Filialni o'chirish" : "Удалить филиал"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "uz"
                ? "Bu filialni o'chirishni tasdiqlaysizmi? Barcha ma'lumotlar o'chib ketadi."
                : "Подтвердите удаление филиала? Все данные будут удалены."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "uz" ? "Bekor qilish" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteBranch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "uz" ? "O'chirish" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!forceDeleteBranch} onOpenChange={(nextOpen) => { if (!nextOpen) { setForceDeleteBranch(null); setActiveCounts(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "uz" ? "Filialni majburiy o'chirish" : "Принудительное удаление филиала"}</AlertDialogTitle>
            <AlertDialogDescription>
              {activeCounts && (lang === "uz"
                ? `Bu filialda: ${activeCounts.students} faol o'quvchi, ${activeCounts.staff} xodim, ${activeCounts.groups} guruh mavjud. Barchasini o'chirishni tasdiqlaysizmi?`
                : `В филиале: ${activeCounts.students} активных студентов, ${activeCounts.staff} сотрудников, ${activeCounts.groups} групп. Подтвердите удаление всего?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "uz" ? "Bekor qilish" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmForceDeleteBranch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "uz" ? "Baribir o'chirish" : "Всё равно удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function BranchDialog({
  open,
  onOpenChange,
  editing,
  lang,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Branch | null;
  lang: "uz" | "ru";
  onCreate: (input: Omit<Branch, "id">) => Branch;
  onUpdate: (id: string, patch: Partial<Branch>) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setAddress(editing?.address ?? "");
      setPhone(editing?.phone ?? "");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) {
      toast.error(lang === "uz" ? "Filial nomini kiriting" : "Введите название филиала");
      return;
    }
    if (editing) {
      onUpdate(editing.id, { name: name.trim(), address: address.trim(), phone: phone.trim() || undefined });
      toast.success(lang === "uz" ? "Filial yangilandi" : "Филиал обновлён");
    } else {
      onCreate({ name: name.trim(), address: address.trim(), phone: phone.trim() || undefined });
      toast.success(lang === "uz" ? "Filial yaratildi" : "Филиал создан");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? (lang === "uz" ? "Filialni tahrirlash" : "Редактировать филиал")
              : (lang === "uz" ? "Yangi filial" : "Новый филиал")}
          </DialogTitle>
          <DialogDescription>
            {lang === "uz" ? "Filial nomi, manzili va telefon raqamini kiriting." : "Укажите название, адрес и телефон филиала."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              {lang === "uz" ? "Filial nomi" : "Название филиала"} *
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "uz" ? "Masalan: Markaziy filial" : "Например: Центральный филиал"} autoFocus autoComplete="off" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              {lang === "uz" ? "Manzil" : "Адрес"}
            </Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={lang === "uz" ? "Toshkent sh..." : "г. Ташкент..."} autoComplete="off" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              {lang === "uz" ? "Telefon" : "Телефон"}
            </Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{lang === "uz" ? "Bekor qilish" : "Отмена"}</Button>
          <Button onClick={submit}>{lang === "uz" ? "Saqlash" : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomColumn({
  branch,
  rooms,
  groups,
  draggedRoomId,
  onDragStart,
  onDrop,
  onDelete,
}: {
  branch: Branch;
  rooms: Room[];
  groups: { roomId: string; name: string }[];
  draggedRoomId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (branchId: string) => void;
  onDelete: (room: Room) => void;
}) {
  const { lang } = useI18n();
  const isDragging = draggedRoomId !== null;

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(branch.id)}
      className={`min-h-[320px] rounded-3xl border border-border bg-muted/25 p-3 transition ${isDragging ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div>
          <div className="font-semibold">{branch.name}</div>
          <div className="text-xs text-muted-foreground">{rooms.length} {lang === "uz" ? "kabinet" : "каб."}</div>
        </div>
        <Badge variant="outline">{lang === "uz" ? "Filial" : "Филиал"}</Badge>
      </div>

      <div className="space-y-3">
        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {lang === "uz" ? "Bu filialda kabinet yo'q. Kabinet qo'shing yoki boshqa ustundan sudrab o'tkazing." : "В этом филиале нет кабинетов. Добавьте кабинет или перетащите из другой колонки."}
          </div>
        ) : (
          rooms.map((room) => {
            const activeGroups = groups.filter((group) => group.roomId === room.id);
            return (
              <div
                key={room.id}
                draggable
                onDragStart={() => onDragStart(room.id)}
                className="group cursor-grab rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-elegant active:cursor-grabbing"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <DoorOpen className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{room.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{lang === "uz" ? "Sig'im" : "Вместимость"}: {room.capacity} {lang === "uz" ? "o'rin" : "мест"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                    <GripVertical className="size-4 text-muted-foreground" />
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => onDelete(room)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-muted/60 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Bog'langan guruhlar" : "Привязанные группы"}</div>
                  <div className="mt-1 text-sm font-medium">{activeGroups.length ? activeGroups.map((group) => group.name).join(", ") : (lang === "uz" ? "Hali guruh yo'q" : "Групп пока нет")}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CreateRoomDialog({
  open,
  onOpenChange,
  branches,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  onCreate: (input: Omit<Room, "id">) => Room;
}) {
  const { lang } = useI18n();
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [capacity, setCapacity] = useState(12);

  const currentBranchId = branchId || branches[0]?.id || "";

  const submit = () => {
    if (!name.trim() || !currentBranchId) {
      toast.error(lang === "uz" ? "Kabinet nomi va filialni tanlang" : "Введите название кабинета и выберите филиал");
      return;
    }
    onCreate({ name: name.trim(), branchId: currentBranchId, capacity });
    toast.success(lang === "uz" ? "Kabinet yaratildi" : "Кабинет создан");
    setName("");
    setCapacity(12);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === "uz" ? "Kabinet qo'shish" : "Добавить кабинет"}</DialogTitle>
          <DialogDescription>{lang === "uz" ? "Guruh yaratishda shu kabinetlardan biri tanlanadi." : "При создании группы выбирается один из этих кабинетов."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Kabinet nomi" : "Название кабинета"} *</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={lang === "uz" ? "Masalan: 101-xona" : "Например: каб. 101"} autoFocus autoComplete="off" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "Filial" : "Филиал"} *</Label>
            <Select value={currentBranchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder={lang === "uz" ? "Filial tanlang" : "Выберите филиал"} /></SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{lang === "uz" ? "O'rinlar soni" : "Количество мест"} *</Label>
            <Input type="number" min={1} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{lang === "uz" ? "Bekor qilish" : "Отмена"}</Button>
          <Button onClick={submit}>{lang === "uz" ? "Yaratish" : "Создать"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ icon: Icon, value, label }: { icon: typeof Users; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
