import { useEffect, useMemo, useState } from "react";

function getLocalDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
import { Ban, CalendarDays, CircleMinus, Edit3, Plus, Search, Trash2, UserRound, Clock, UserCheck, CheckCircle2, XCircle, Award, Gift } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { penaltyApi, bonusApi, staffApi, branchApi, analyticsApi, lessonApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { StaffPenalty, StaffPenaltyStatus } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function pageLabels(lang: string) {
  const isUz = lang === "uz";
  return {
    pageTitle: isUz ? "Nazorat" : "Контроль",
    pageSubtitle: isUz ? "O'qituvchilar faoliyati va davomatini nazorat qilish" : "Контроль активности и посещаемости преподавателей",
    bugun: isUz ? "Bugun" : "Сегодня",
    teachers_tab: isUz ? "O'qituvchilar" : "Преподаватели",
    penalty_bonus_tab: isUz ? "Jarima / Bonus" : "Штраф / Бонус",
    penalties: isUz ? "Jarimalar" : "Штрафы",
    bonuses: isUz ? "Bonuslar" : "Бонусы",
    teacher_arrived: isUz ? "Keldi" : "Пришел",
    teacher_late: isUz ? "Kech qoldi" : "Опоздал",
    teacher_absent: isUz ? "Kelmadi" : "Не пришел",
    teacher_waiting: isUz ? "Kutilmoqda" : "Ожидается",
    lesson_no_attendance_alert: isUz ? "⚠️ Davomat belgilanmagan" : "⚠️ Посещаемость не отмечена",
    bonus_new: isUz ? "Yangi bonus" : "Новый бонус",
    bonus_amount: isUz ? "Summa" : "Сумма",
    bonus_reason: isUz ? "Sabab" : "Причина",
    bonus_templates: isUz ? ["Ajoyib natijalar", "Guruh to'ldi", "O'quvchi maqtovi", "Oy bo'yi davomatli", "Boshqa"] : ["Отличные результаты", "Группа заполнена", "Похвала ученика", "Посещаемость за месяц", "Другое"],
    penalty_templates: isUz ? ["Kechikish", "Darsni o'tkazib yuborish", "Davomat belgilanmagan", "Tartib buzilishi", "Boshqa"] : ["Опоздание", "Пропуск занятия", "Посещаемость не отмечена", "Нарушение порядка", "Другое"],
    score_column: isUz ? "Reyting" : "Рейтинг",
    searchTeacher: isUz ? "O'qituvchini qidirish..." : "Поиск преподавателя...",
    allBranches: isUz ? "Barcha filiallar" : "Все филиалы",
    staff: isUz ? "Xodim" : "Сотрудник",
    lessonConversion: isUz ? "Darslar" : "Занятия",
    attendance: isUz ? "Davomat" : "Посещаемость",
    lates: isUz ? "Kechikishlar" : "Опоздания",
    students: isUz ? "O'quvchilar" : "Ученики",
    addPenalty: isUz ? "Jarima" : "Штраф",
    addBonus: isUz ? "Bonus" : "Бонус",
    emptyStateLine1: isUz ? "Ma'lumot topilmadi" : "Данные не найдены",
    emptyStateLine2: isUz ? "Boshqa sanani tanlang" : "Выберите другую дату",
    addTitlePenalty: isUz ? "Jarima qo'shish" : "Добавить штраф",
    addTitleBonus: isUz ? "Bonus qo'shish" : "Добавить бонус",
    amount: isUz ? "Summa" : "Сумма",
    reason: isUz ? "Sabab" : "Причина",
    comment: isUz ? "Izoh" : "Комментарий",
    reasonPlaceholder: isUz ? "Sababni kiriting" : "Введите причину",
    commentPlaceholder: isUz ? "Qo'shimcha izoh..." : "Дополнительный комментарий...",
    cancel: isUz ? "Bekor qilish" : "Отмена",
    create: isUz ? "Yaratish" : "Создать",
    save: isUz ? "Saqlash" : "Сохранить",
    delete: isUz ? "O'chirish" : "Удалить",
    detail: isUz ? "Batafsil" : "Подробно",
    empty: isUz ? "Hech narsa topilmadi" : "Ничего не найдено",
    kpiAmount: isUz ? "Umumiy summa" : "Общая сумма",
    kpiActive: isUz ? "Faol" : "Активные",
    kpiMonth: isUz ? "Oy" : "Месяц",
    kpiRecords: isUz ? "Yozuvlar" : "Записи",
    allMonths: isUz ? "Barcha" : "Все",
    search: isUz ? "Qidirish..." : "Поиск...",
    allStatuses: isUz ? "Barcha holatlar" : "Все статусы",
    statusLabel: isUz ? "Holati" : "Статус",
    date: isUz ? "Sana" : "Дата",
    branch: isUz ? "Filial" : "Филиал",
    selectStaff: isUz ? "Xodimni tanlang" : "Выберите сотрудника",
    notSelected: isUz ? "Tanlanmagan" : "Не выбран",
    required: isUz ? "Barcha maydonlarni to'ldiring" : "Заполните все поля",
    created: isUz ? "Muvaffaqiyatli yaratildi" : "Успешно создано",
    saved: isUz ? "Muvaffaqiyatli saqlandi" : "Успешно сохранено",
    deleted: isUz ? "Muvaffaqiyatli o'chirildi" : "Успешно удалено",
    status: {
      active: isUz ? "Faol" : "Активный",
      cancelled: isUz ? "Bekor qilingan" : "Отменен",
    },
    lessonStatuses: {
      scheduled: isUz ? "Rejalashtirilgan" : "Запланировано",
      conducted: isUz ? "O'tildi" : "Проведено",
      cancelled: isUz ? "Bekor qilingan" : "Отменено",
      rescheduled: isUz ? "Ko'chirilgan" : "Перенесено",
    },
    teacherCheckinTime: isUz ? "Kelish vaqti" : "Время прихода",
    onTime: isUz ? "O'z vaqtida" : "Вовремя",
    checkinStatuses: {
      present: isUz ? "O'z vaqtida" : "Вовремя",
      late: isUz ? "Kech qoldi" : "Опоздал",
      absent: isUz ? "Kelmadi" : "Не пришел"
    },
    lateMinutes: isUz ? "Kechikish (daqiqa)" : "Опоздание (минут)",
    minutes: isUz ? "daq" : "мин",
  };
}

export function NazoratPage() {
  const { lang } = useI18n();
  const labels = pageLabels(lang);

  return (
    <PageShell title={labels.pageTitle} subtitle={labels.pageSubtitle}>
      <div className="w-full">
        <Tabs defaultValue="bugun" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="bugun">{labels.bugun}</TabsTrigger>
            <TabsTrigger value="teachers">{labels.teachers_tab}</TabsTrigger>
            <TabsTrigger value="penalties">{labels.penalty_bonus_tab}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bugun" className="m-0 outline-none">
            <BugunTab labels={labels} lang={lang} />
          </TabsContent>

          <TabsContent value="teachers" className="m-0 outline-none">
            <TeachersTab labels={labels} lang={lang} />
          </TabsContent>
          
          <TabsContent value="penalties" className="m-0 outline-none">
            <PenaltyBonusTab labels={labels} lang={lang} />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

function BugunTab({ labels, lang }: { labels: ReturnType<typeof pageLabels>; lang: string }) {
  const { user } = useAuth();
    const [date, setDate] = useState(() => getLocalDateString());
  const [branchId, setBranchId] = useState("all");
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [teachersData, setTeachersData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [lessonsHistory, setLessonsHistory] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [currentCheckin, setCurrentCheckin] = useState<any>(null);

  const [checkinForm, setCheckinForm] = useState({ time: "", status: "present", lateMinutes: "" });

  const isDirectorOrAdmin = user?.role === "director" || user?.role === "superadmin";

  useEffect(() => {
    if (isDirectorOrAdmin) {
      branchApi.list().then(res => {
        const bList = Array.isArray(res) ? res : (res as any).results ?? [];
        setBranches(bList.map((item: any) => ({ id: item.id, name: item.name })));
      }).catch(console.error);
    }
  }, [isDirectorOrAdmin]);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { date_from: date, date_to: date };
      if (branchId !== "all") params.branch_id = branchId;
      const res = await analyticsApi.teachers(params);
      let list = (res as any).results || [];
      setTeachersData(list);
    } catch (err) {
      console.error(err);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, [branchId, date]);

  const openTeacherDetail = async (teacher: any) => {
    setSelectedTeacherId(teacher.teacher_id);
    setLoadingLessons(true);
    setCurrentCheckin(null);
    try {
      const params: any = { teacher_id: teacher.teacher_id, date_from: date, date_to: date };
      const res = await analyticsApi.teacherLessons(params);
      const lessons = Array.isArray(res) ? res : (res as any).results || [];
      setLessonsHistory(lessons);

      // Load existing check-in from the first lesson and update teachersData with it
      if (lessons.length > 0) {
          const firstLesson = lessons[0];
          try {
              const checkinData = await lessonApi.teacherCheckin.get(firstLesson.id);
              setCurrentCheckin(checkinData);
              
              // Update teachersData with real checkin status
              setTeachersData(prev => prev.map(t => 
                t.teacher_id === teacher.teacher_id 
                  ? { ...t, checkin_status: checkinData?.status, checkin_time: checkinData?.check_in_time }
                  : t
              ));
              
              // Pre-fill form with existing checkin data
              if (checkinData && checkinData.status) {
                  setCheckinForm({
                      time: checkinData.check_in_time?.slice(0, 5) || "",
                      status: checkinData.status,
                      lateMinutes: checkinData.late_minutes?.toString() || ""
                  });
              } else {
                  const now = new Date();
                  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                  setCheckinForm({ time: currentTime, status: "present", lateMinutes: "" });
              }
          } catch (err) {
              const now = new Date();
              const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              setCheckinForm({ time: currentTime, status: "present", lateMinutes: "" });
          }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleCheckinSubmit = async () => {
      if (!lessonsHistory.length) return;
      const firstLesson = lessonsHistory[0];
      try {
          const newCheckinData = {
              status: checkinForm.status,
              late_minutes: checkinForm.status === "late" ? Number(checkinForm.lateMinutes) : 0,
              notes: ""
          };
          await lessonApi.teacherCheckin.set(firstLesson.id, newCheckinData);
          
          // Update currentCheckin and teachersData with new status
          const updatedCheckinData = { 
              ...currentCheckin,
              status: checkinForm.status,
              late_minutes: newCheckinData.late_minutes,
              check_in_time: checkinForm.time
          };
          setCurrentCheckin(updatedCheckinData);
          
          setTeachersData(prev => prev.map(t => 
            t.teacher_id === selectedTeacherId 
              ? { ...t, checkin_status: checkinForm.status, checkin_time: checkinForm.time }
              : t
          ));
          
          toast.success(labels.saved);
      } catch (err) {
          toast.error("Xatolik");
      }
  };

  const selectedTeacher = useMemo(() => teachersData.find(t => t.teacher_id === selectedTeacherId), [teachersData, selectedTeacherId]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        {isDirectorOrAdmin && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allBranches}</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teachersData.length === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground flex flex-col items-center justify-center space-y-3">
              <CircleMinus className="h-10 w-10 text-muted-foreground/30" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{labels.emptyStateLine1}</p>
                <p className="text-xs">{labels.emptyStateLine2}</p>
              </div>
            </div>
          ) : teachersData.map((teacher) => {
            // Determine teacher's actual check-in status from TeacherAttendance
            let badgeVariant: "default" | "destructive" | "outline" | "secondary" = "secondary";
            let badgeText = labels.teacher_waiting;
            let badgeClass = "bg-muted text-muted-foreground";

            // Use real checkin_status from TeacherAttendance model
            const checkinStatus = teacher.checkin_status;
            if (!checkinStatus) {
              badgeVariant = "secondary";
              badgeText = labels.teacher_waiting;
              badgeClass = "bg-muted text-muted-foreground";
            } else if (checkinStatus === "present") {
              badgeVariant = "default";
              const timeDisplay = teacher.checkin_time?.slice(0, 5) || "";
              badgeText = `${labels.teacher_arrived}${timeDisplay ? ` ${timeDisplay}` : ""}`;
              badgeClass = "bg-emerald-500 hover:bg-emerald-600";
            } else if (checkinStatus === "late") {
              badgeVariant = "outline";
              const lateMinutes = teacher.checkin_time ? 
                Math.round((new Date(`2000-01-01 ${checkinForm.time}`).getTime() - new Date(`2000-01-01 ${teacher.checkin_time}`).getTime()) / 60000) : 0;
              badgeText = `${labels.teacher_late} — ${Math.abs(lateMinutes)} ${labels.minutes}`;
              badgeClass = "border-amber-500 text-amber-500 bg-amber-500/10";
            } else if (checkinStatus === "absent") {
              badgeVariant = "destructive";
              badgeText = labels.teacher_absent;
              badgeClass = "bg-destructive text-destructive-foreground";
            }

            return (
              <Card key={teacher.teacher_id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openTeacherDetail(teacher)}>
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>{teacher.teacher_name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium line-clamp-1">{teacher.teacher_name || "-"}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{teacher.branch_name || "-"}</div>
                    <Badge variant={badgeVariant} className={`mt-2 ${badgeClass} border-none`}>
                      {badgeVariant === "default" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {badgeText}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {teacher.total_lessons} {labels.lessonConversion}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserRound className="h-3 w-3" /> {teacher.present_count}/{teacher.present_count + teacher.absent_count}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Sheet open={!!selectedTeacherId} onOpenChange={(open) => !open && setSelectedTeacherId(null)}>
        <SheetContent className="w-full overflow-hidden sm:max-w-xl flex flex-col p-0">
            <SheetHeader className="p-6 pb-4 border-b bg-muted/30">
            <div className="flex justify-between items-start gap-4">
              <SheetTitle className="text-xl">{selectedTeacher?.teacher_name || labels.detail}</SheetTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { toast.success(labels.addTitlePenalty + ": " + (selectedTeacher?.teacher_name ?? "")); }}>{labels.addPenalty}</Button>
                <Button size="sm" variant="outline" onClick={() => { toast.success(labels.addTitleBonus + ": " + (selectedTeacher?.teacher_name ?? "")); }}>{labels.addBonus}</Button>
              </div>
            </div>
            <div className="mt-4 bg-card rounded-lg border p-4 shadow-sm">
              <h4 className="text-sm font-medium mb-3">{labels.teacherCheckinTime}</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Input type="time" value={checkinForm.time} onChange={e => setCheckinForm({...checkinForm, time: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <Select value={checkinForm.status} onValueChange={(val) => setCheckinForm({...checkinForm, status: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">{labels.checkinStatuses.present}</SelectItem>
                      <SelectItem value="late">{labels.checkinStatuses.late}</SelectItem>
                      <SelectItem value="absent">{labels.checkinStatuses.absent}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {checkinForm.status === "late" && (
                  <div className="space-y-1.5 col-span-2">
                    <Input type="number" placeholder={labels.lateMinutes} value={checkinForm.lateMinutes} onChange={e => setCheckinForm({...checkinForm, lateMinutes: e.target.value})} />
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={handleCheckinSubmit}>{labels.save}</Button>
            </div>
            </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
            {loadingLessons ? (
               <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : lessonsHistory.length === 0 ? (
               <div className="text-center p-10 text-muted-foreground">{labels.empty}</div>
            ) : (
               <div className="space-y-4">
                 {lessonsHistory.map((lesson) => {
                  const noAttendanceAlert = lesson.status === "conducted" && lesson.present_count === 0 && lesson.total_students > 0;
                  let statusBg = "bg-[#0077b6]";
                  if (lesson.status === "conducted") statusBg = "bg-emerald-500";
                  else if (lesson.status === "cancelled") statusBg = "bg-destructive";
                  else if (lesson.status === "rescheduled") statusBg = "bg-amber-500";

                  // Форматирование времени и даты
                  const lessonTime = lesson.datetime ? new Date(lesson.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (lesson.start_time?.slice(0,5) || "");
                  const lessonDate = lesson.datetime ? formatDate(lesson.datetime, lang) : "";
                  const topic = lesson.topic || <span className="text-muted-foreground">Mavzu yo'q</span>;

                  return (
                    <Card key={lesson.id} className="p-4 shadow-sm border-l-4" style={{ borderLeftColor: `var(--${statusBg.split('-')[1]}-500, currentColor)`}}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-lg flex items-center gap-2">
                          <span>{lessonTime}</span>
                          <span className="text-base font-normal text-muted-foreground ml-2">{lesson.group_name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{lessonDate}</div>
                        </div>
                        <Badge className={`${statusBg} border-none`}>{labels.lessonStatuses[lesson.status as keyof typeof labels.lessonStatuses] || lesson.status}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">{topic}</div>
                      <div className="flex items-center text-sm font-medium gap-2">
                        👥 {lesson.present_count}/{lesson.total_students} {(lesson.total_students > 0 ? (lesson.present_count / lesson.total_students * 100).toFixed(0) : 0)}%
                      </div>
                      {noAttendanceAlert && (
                        <div className="mt-3 bg-amber-500/15 text-amber-600 px-3 py-2 rounded-md text-sm font-medium flex items-center">
                          {labels.lesson_no_attendance_alert}
                        </div>
                      )}
                    </Card>
                  );
                 })}
               </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TeachersTab({ labels, lang }: { labels: ReturnType<typeof pageLabels>; lang: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [teachersData, setTeachersData] = useState<any[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    branchApi.list().then(res => {
      const bList = Array.isArray(res) ? res : (res as any).results ?? [];
      setBranches(bList.map((item: any) => ({ id: item.id, name: item.name })));
    }).catch(console.error);
  }, []);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branch_id = branchId;
      if (month) {
        params.date_from = `${month}-01`;
        params.date_to = `${month}-31`;
      }
      const res = await analyticsApi.teachers(params);
      let list = (res as any).results || [];
      if (debouncedSearch.trim()) {
        const lowerSearch = debouncedSearch.toLowerCase().trim();
        list = list.filter((t: any) => t.teacher_name?.toLowerCase().includes(lowerSearch));
      }
      setTeachersData(list);
    } catch (err) {
      console.error(err);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, [branchId, month, debouncedSearch]);

  const calculateScore = (t: any) => {
    const score = (t.conduct_rate * 0.5) + (t.attendance_rate * 0.3) + (Math.max(0, 100 - t.avg_late_minutes * 2) * 0.2);
    return Math.min(100, Math.max(0, score));
  };

  return (
    <Card className="overflow-hidden shadow-elegant">
      <div className="grid gap-3 border-b border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_170px_190px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.searchTeacher} className="pl-9" />
        </div>
        <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.allBranches}</SelectItem>
            {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.staff}</TableHead>
              <TableHead>{labels.lessonConversion}</TableHead>
              <TableHead>{labels.attendance}</TableHead>
              <TableHead>{labels.lates}</TableHead>
              <TableHead className="w-32">{labels.score_column}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachersData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <CircleMinus className="h-10 w-10 text-muted-foreground/30" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{labels.emptyStateLine1}</p>
                        <p className="text-xs">{labels.emptyStateLine2}</p>
                      </div>
                    </div>
                </TableCell>
              </TableRow>
            ) : teachersData.map((teacher) => {
              const score = calculateScore(teacher);
              let scoreColor = "bg-primary";
              if (score < 60) scoreColor = "bg-destructive";
              else if (score < 80) scoreColor = "bg-amber-500";
              else scoreColor = "bg-emerald-500";

              return (
              <TableRow key={teacher.teacher_id} className="hover:bg-accent/40">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{teacher.teacher_name?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{teacher.teacher_name || "-"}</div>
                      <div className="text-xs text-muted-foreground">{teacher.branch_name || "-"}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 w-32">
                    <div className="flex justify-between text-xs items-center">
                      <span className="text-muted-foreground">{teacher.conducted_lessons} / {teacher.total_lessons}</span>
                      <span className="font-medium flex items-center">{teacher.conduct_rate}%</span>
                    </div>
                    <Progress value={teacher.conduct_rate} className="h-1.5" indicatorColor={teacher.conduct_rate < 80 ? "bg-amber-500" : "bg-emerald-500"} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 w-32">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{teacher.present_count} / {teacher.present_count + teacher.absent_count}</span>
                      <span className="font-medium">{teacher.attendance_rate}%</span>
                    </div>
                    <Progress value={teacher.attendance_rate} className="h-1.5" indicatorColor={teacher.attendance_rate < 80 ? "bg-destructive" : "bg-primary"} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {teacher.late_count === 0 ? (
                      <span className="text-muted-foreground ml-3">—</span>
                    ) : (
                      <div className="flex items-center justify-center rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                        {teacher.late_count}
                      </div>
                    )}
                    {teacher.late_count > 0 && (
                      <div className="flex items-center text-xs text-destructive/80">
                        <Clock className="mr-1 h-3 w-3" />
                        {~~teacher.avg_late_minutes} min
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col gap-1 w-24">
                        <div className="font-semibold text-right text-sm">{score.toFixed(1)}</div>
                        <Progress value={score} className="h-2" indicatorColor={scoreColor} />
                    </div>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function PenaltyBonusTab({ labels, lang }: { labels: ReturnType<typeof pageLabels>; lang: string }) {
    return (
        <Tabs defaultValue="penalties" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="penalties">{labels.penalties}</TabsTrigger>
                <TabsTrigger value="bonuses">{labels.bonuses}</TabsTrigger>
            </TabsList>
            <TabsContent value="penalties" className="m-0 outline-none">
                <PenaltiesSubTab labels={labels} lang={lang} />
            </TabsContent>
            <TabsContent value="bonuses" className="m-0 outline-none">
                <BonusesSubTab labels={labels} lang={lang} />
            </TabsContent>
        </Tabs>
    );
}

// Re-using the same sub-tab logic but parameterizing it for bonus vs penalty
function PenaltiesSubTab({ labels, lang }: { labels: ReturnType<typeof pageLabels>; lang: string }) {
    return <TransactionTab type="penalty" labels={labels} lang={lang} />
}

function BonusesSubTab({ labels, lang }: { labels: ReturnType<typeof pageLabels>; lang: string }) {
    return <TransactionTab type="bonus" labels={labels} lang={lang} />
}

function TransactionTab({ type, labels, lang }: { type: "penalty"|"bonus", labels: ReturnType<typeof pageLabels>; lang: string }) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StaffPenaltyStatus | "all">("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState("all");
  
  const [records, setRecords] = useState<any[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; fullName: string; role: string; branchId?: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const emptyForm = { staffId: "", branchId: "", amount: "", reason: "", date: new Date().toISOString().slice(0, 10), status: "active", comment: "" };
  const [form, setForm] = useState(emptyForm);

  const isWriteAllowed = user?.role === "director" || user?.role === "superadmin" || user?.role === "admin";
  const apiCall = type === "penalty" ? penaltyApi : bonusApi;

  const staffList = useMemo(() => staff.filter((item) => item.role !== "director"), [staff]);
  const branchById = useMemo(() => Object.fromEntries(branches.map((item) => [item.id, item])), [branches]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [staffRes, branchesRes] = await Promise.all([ staffApi.list(), branchApi.list() ]);
        const staffListRaw = Array.isArray(staffRes) ? staffRes : (staffRes as any).results ?? [];
        const branchesListRaw = Array.isArray(branchesRes) ? branchesRes : (branchesRes as any).results ?? [];

        setStaff(staffListRaw.map((item: any) => ({
          id: item.id, fullName: item.full_name, role: item.role, branchId: item.branch || undefined,
        })));
        setBranches(branchesListRaw.map((item: any) => ({ id: item.id, name: item.name })));
      } catch (err) { console.error(err); }
    };
    loadStaticData();
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status !== "all") params.status = status;
      if (branchId !== "all") params.branch_id = branchId;
      if (month) {
        params.date_from = `${month}-01`;
        params.date_to = `${month}-31`;
      }
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await apiCall.list(params);
      const listRaw = Array.isArray(res) ? res : (res as any).results ?? [];
      setRecords(listRaw);
    } catch (err) {
      toast.error("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [status, branchId, month, debouncedSearch]);

  const totals = useMemo(() => {
    const active = records.filter(r => (r.status === "active" || r.status === undefined)); // bonuses might not have status initially
    return {
      all: records.length,
      amount: active.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };
  }, [records]);

  const openCreate = () => {
    const firstStaff = staffList[0];
    setForm({
      ...emptyForm,
      staffId: firstStaff?.id ?? "",
      branchId: firstStaff?.branchId ?? branches[0]?.id ?? "",
        date: getLocalDateString(),
    });
    setDialogOpen(true);
  };

  const saveNew = async () => {
    if (!form.staffId || !Number(form.amount) || !form.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    const staffMember = staff.find(s => s.id === form.staffId);
    try {
      const payload: any = {
        staff: form.staffId,
        branch: form.branchId || staffMember?.branchId || null,
        amount: Number(form.amount),
        reason: form.reason.trim(),
        comment: form.comment.trim() || undefined,
      };
      if (type === "penalty") {
          payload.penalty_date = form.date;
          payload.status = form.status;
      } else {
          payload.bonus_date = form.date;
      }

      await apiCall.create(payload);
      setDialogOpen(false);
      toast.success(labels.created);
      loadRecords();
    } catch (err) {
      toast.error("Xatolik yuz berdi");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{type === "bonus" ? labels.bonuses : labels.penalties}</h3>
        {isWriteAllowed && (
          <Button onClick={openCreate} className={type === "bonus" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gradient-primary"}>
            <Plus className="mr-1 size-4" /> {type === "bonus" ? labels.addBonus : labels.addPenalty}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Kpi icon={type === "bonus" ? Gift : Ban} label={labels.kpiAmount} value={formatMoney(totals.amount, lang)} tone={type === "bonus" ? "success" : "danger"} />
        <Kpi icon={CalendarDays} label={labels.kpiMonth} value={month || labels.allMonths} />
        <Kpi icon={UserRound} label={labels.kpiRecords} value={String(totals.all)} />
      </div>

      <Card className="overflow-hidden shadow-elegant">
        <div className="grid gap-3 border-b border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={labels.search} className="pl-9" />
          </div>
          {type === "penalty" && (
            <Select value={status} onValueChange={(value) => setStatus(value as StaffPenaltyStatus | "all")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                <SelectItem value="all">{labels.allStatuses}</SelectItem>
                <SelectItem value="active">{labels.status.active}</SelectItem>
                <SelectItem value="cancelled">{labels.status.cancelled}</SelectItem>
                </SelectContent>
            </Select>
          )}
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allBranches}</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.staff}</TableHead>
                <TableHead>{labels.reason}</TableHead>
                <TableHead>{labels.date}</TableHead>
                {type === "penalty" && <TableHead>{labels.statusLabel}</TableHead>}
                <TableHead className="text-right">{labels.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{labels.empty}</TableCell></TableRow>
              ) : records.map((record) => {
                const dateVal = record.penalty_date || record.bonus_date;
                return (
                  <TableRow key={record.id} className="hover:bg-accent/40">
                    <TableCell>
                      <div className="font-medium">{record.staff_name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{record.branch ? branchById[record.branch]?.name ?? "-" : "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{record.reason}</div>
                      {record.comment && <div className="line-clamp-1 text-xs text-muted-foreground">{record.comment}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(dateVal, lang)}</TableCell>
                    {type === "penalty" && (
                        <TableCell>
                            <Badge variant={record.status === "active" ? "default" : "secondary"}>
                                {record.status === "active" ? labels.status.active : labels.status.cancelled}
                            </Badge>
                        </TableCell>
                    )}
                    <TableCell className={`text-right font-semibold ${type === "bonus" ? "text-emerald-600" : "text-destructive"}`}>
                      {type === "bonus" ? "+" : "-"}{formatMoney(record.amount, lang)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type === "bonus" ? labels.addTitleBonus : labels.addTitlePenalty}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>{labels.staff}</Label>
                    <Select value={form.staffId} onValueChange={(val) => setForm({...form, staffId: val})}>
                        <SelectTrigger><SelectValue placeholder={labels.selectStaff} /></SelectTrigger>
                        <SelectContent>
                        {staff.map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label>{labels.amount}</Label>
                    <Input type="number" min={0} step={1000} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
            </div>
            
            <div className="space-y-1.5">
                <Label>{labels.reason}</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {(type === "bonus" ? labels.bonus_templates : labels.penalty_templates).map(t => (
                        <Badge key={t} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setForm({...form, reason: t})}>
                            {t}
                        </Badge>
                    ))}
                </div>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={labels.reasonPlaceholder} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>{labels.date}</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label>{labels.comment}</Label>
                <Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder={labels.commentPlaceholder} rows={3} />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>{labels.cancel}</Button>
          <Button onClick={saveNew}>{labels.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: { icon: any; label: string; value: string; tone?: "default" | "danger" | "success" }) {
  let bg = "bg-primary/15 text-primary";
  if (tone === "danger") bg = "bg-destructive/15 text-destructive";
  if (tone === "success") bg = "bg-emerald-500/15 text-emerald-600";
  return (
    <Card className="p-4 shadow-elegant">
      <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}
