import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, DoorOpen, GripVertical, Layers, MapPin, Plus, Trash2, Users, Briefcase } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import type { Branch, Room } from "@/lib/data/types";

export const Route = createFileRoute("/director/branches")({ component: BranchesPage });

function BranchesPage() {
  const { t, lang } = useI18n();
  const { branches, rooms, staff, students, groups, addRoom, updateRoom, deleteRoom, isLoading } = useData();
  const [openRoom, setOpenRoom] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);

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
      subtitle="Filiallar, kabinetlar va ularning yuklamasini boshqarish"
      actions={
        <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={() => setOpenRoom(true)}>
          <Plus className="size-3.5" /> Kabinet qo'shish
        </Button>
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
          <Card className="p-12 text-center text-sm text-muted-foreground">Avval filial yarating. Keyin kabinet qo'shish mumkin bo'ladi.</Card>
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
                      <Badge className="bg-white/20 text-primary-foreground hover:bg-white/30">{branchRooms.length} kabinet</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 p-4">
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
                  <h2 className="text-lg font-semibold">Kabinetlar doskasi</h2>
                  <p className="text-sm text-muted-foreground">Kabinet kartasini ushlab boshqa filial ustuniga olib o'tish mumkin.</p>
                </div>
                <Button variant="outline" onClick={() => setOpenRoom(true)} className="gap-2">
                  <Plus className="size-4" /> Kabinet qo'shish
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
                        toast.error("Bu kabinet guruhga biriktirilgan. Avval guruhni boshqa kabinetga o'tkazing.");
                        return;
                      }
                      deleteRoom(room.id);
                      toast.success("Kabinet o'chirildi");
                    }}
                  />
                ))}
              </div>
            </Card>
          </>
        )}
      </div>

      <CreateRoomDialog open={openRoom} onOpenChange={setOpenRoom} branches={branches} onCreate={addRoom} />
    </PageShell>
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
          <div className="text-xs text-muted-foreground">{rooms.length} kabinet</div>
        </div>
        <Badge variant="outline">Filial</Badge>
      </div>

      <div className="space-y-3">
        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Bu filialda kabinet yo'q. Kabinet qo'shing yoki boshqa ustundan sudrab o'tkazing.
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
                      <div className="mt-1 text-xs text-muted-foreground">Sig'im: {room.capacity} o'rin</div>
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
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Bog'langan guruhlar</div>
                  <div className="mt-1 text-sm font-medium">{activeGroups.length ? activeGroups.map((group) => group.name).join(", ") : "Hali guruh yo'q"}</div>
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
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [capacity, setCapacity] = useState(12);

  const currentBranchId = branchId || branches[0]?.id || "";

  const submit = () => {
    if (!name.trim() || !currentBranchId) {
      toast.error("Kabinet nomi va filialni tanlang");
      return;
    }
    onCreate({ name: name.trim(), branchId: currentBranchId, capacity });
    toast.success("Kabinet yaratildi");
    setName("");
    setCapacity(12);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kabinet qo'shish</DialogTitle>
          <DialogDescription>Guruh yaratishda shu kabinetlardan biri tanlanadi.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Kabinet nomi *</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Masalan: 101-xona" autoFocus autoComplete="off" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Filial *</Label>
            <Select value={currentBranchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Filial tanlang" /></SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">O'rinlar soni *</Label>
            <Input type="number" min={1} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button onClick={submit}>Yaratish</Button>
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
