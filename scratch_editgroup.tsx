
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
            <Input value={name} onChange={(e) => setName(e.target.value)} />
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
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.startDate")} *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("groups.field.price")} *</Label>
              <Input type="number" min={0} step={10000} value={monthlyPrice} onChange={(e) => setMonthlyPrice(Number(e.target.value))} />
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
