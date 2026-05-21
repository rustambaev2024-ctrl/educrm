import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarDays, CircleMinus, Edit3, Plus, Search, Trash2, UserRound, Clock, UserCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { penaltyApi, staffApi, branchApi, analyticsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { StaffPenalty, StaffPenaltyStatus } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/control")({ component: NazoratPage });

type FormState = {
  staffId: string;
  branchId: string;
  amount: string;
  reason: string;
  penaltyDate: string;
  status: StaffPenaltyStatus;
  comment: string;
};

type StatusFilter = StaffPenaltyStatus | "all";

const emptyForm: FormState = {
  staffId: "",
  branchId: "",
  amount: "",
  reason: "",
  penaltyDate: new Date().toISOString().slice(0, 10),
  status: "active",
  comment: "",
};

function NazoratPage() {
  const { lang } = useI18n();
  const labels = pageLabels(lang);

  return (
    <>
      <PageHeader
        title={labels.pageTitle}
        description={labels.pageSubtitle}
      />
      <div className="flex-1 w-full p-4 md:p-8 pt-0 md:pt-4">
        <Tabs defaultValue="teachers" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="teachers">{labels.tabTeachers}</TabsTrigger>
            <TabsTrigger value="penalties">{labels.tabPenalties}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="teachers" className="m-0 outline-none">
            <TeachersTab labels={labels} />
          </TabsContent>
          
          <TabsContent value="penalties" className="m-0 outline-none">
            <PenaltiesTab labels={labels} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function TeachersTab({ labels }: { labels: ReturnType<typeof pageLabels> }) {
  const { lang } = useI18n();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [teachersData, setTeachersData] = useState<any[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [lessonsHistory, setLessonsHistory] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [quickPenaltyTeacher, setQuickPenaltyTeacher] = useState<any>(null);
  const [quickPenaltyForm, setQuickPenaltyForm] = useState({ amount: "", reason: "", comment: "" });

  const openQuickPenalty = (teacher: any) => {
    setQuickPenaltyTeacher(teacher);
    setQuickPenaltyForm({ amount: "", reason: "", comment: "" });
  };

  const handleQuickPenaltySubmit = async () => {
    if (!quickPenaltyForm.amount || !quickPenaltyForm.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    try {
      await penaltyApi.create({
        staff: quickPenaltyTeacher.teacher_id,
        branch: quickPenaltyTeacher.branch_id || null,
        amount: Number(quickPenaltyForm.amount),
        reason: quickPenaltyForm.reason.trim(),
        penalty_date: new Date().toISOString().slice(0, 10),
        status: "active",
        comment: quickPenaltyForm.comment.trim() || undefined,
      });
      toast.success(labels.created);
      setQuickPenaltyTeacher(null);
    } catch (err) {
      toast.error("Xatolik yuz berdi");
    }
  };

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

  const openTeacherDetail = async (teacher: any) => {
    setSelectedTeacherId(teacher.teacher_id);
    setLoadingLessons(true);
    try {
      const params: any = { teacher_id: teacher.teacher_id };
      if (month) {
        params.date_from = `${month}-01`;
        params.date_to = `${month}-31`;
      }
      const res = await analyticsApi.teacherLessons(params);
      setLessonsHistory(Array.isArray(res) ? res : (res as any).results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLessons(false);
    }
  };

  const selectedTeacher = useMemo(() => teachersData.find(t => t.teacher_id === selectedTeacherId), [teachersData, selectedTeacherId]);

  return (
    <>
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
                <TableHead className="text-right">{labels.students}</TableHead>
                <TableHead className="text-right w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachersData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <CircleMinus className="h-10 w-10 text-muted-foreground/30" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{labels.emptyStateLine1}</p>
                        <p className="text-xs">{labels.emptyStateLine2}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : teachersData.map((teacher) => (
                <TableRow key={teacher.teacher_id} className="cursor-pointer hover:bg-accent/40" onClick={() => openTeacherDetail(teacher)}>
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
                        <span className="font-medium flex items-center">
                          {teacher.conduct_rate}%
                          {teacher.conduct_rate === 0 && teacher.total_lessons > 0 ? (
                            <Badge variant="destructive" className="ml-2 h-5 px-1.5 rounded text-[10px]">⚠️</Badge>
                          ) : teacher.conduct_rate < 50 ? (
                            <Badge variant="outline" className="ml-2 h-5 px-1.5 rounded text-[10px] border-amber-500 text-amber-500">⚠️</Badge>
                          ) : null}
                        </span>
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5 font-medium">
                      <UserCheck className="h-4 w-4 text-muted-foreground" />
                      {teacher.students_count}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openQuickPenalty(teacher)} className="h-8">
                      <Ban className="mr-1 h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs text-muted-foreground">{labels.addPenalty}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!quickPenaltyTeacher} onOpenChange={(open) => !open && setQuickPenaltyTeacher(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.addTitle}</DialogTitle>
            <DialogDescription>{quickPenaltyTeacher?.teacher_name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label>{labels.amount}</Label>
              <Input type="number" min={0} step={1000} value={quickPenaltyForm.amount} onChange={(e) => setQuickPenaltyForm({ ...quickPenaltyForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{labels.reason}</Label>
              <Input value={quickPenaltyForm.reason} onChange={(e) => setQuickPenaltyForm({ ...quickPenaltyForm, reason: e.target.value })} placeholder={labels.reasonPlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label>{labels.comment}</Label>
              <Textarea value={quickPenaltyForm.comment} onChange={(e) => setQuickPenaltyForm({ ...quickPenaltyForm, comment: e.target.value })} placeholder={labels.commentPlaceholder} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickPenaltyTeacher(null)}>{labels.cancel}</Button>
            <Button onClick={handleQuickPenaltySubmit}>{labels.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedTeacherId} onOpenChange={(open) => !open && setSelectedTeacherId(null)}>
        <SheetContent className="w-full overflow-hidden sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="p-6 pb-2 border-b">
            <SheetTitle>{selectedTeacher?.teacher_name || labels.detail}</SheetTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {selectedTeacher?.conducted_lessons}</span>
              <span className="flex items-center gap-1"><XCircle className="h-4 w-4 text-destructive" /> {selectedTeacher?.cancelled_lessons}</span>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-4 bg-muted/20">
            {loadingLessons ? (
               <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : lessonsHistory.length === 0 ? (
               <div className="text-center p-10 text-muted-foreground">{labels.empty}</div>
            ) : (
               <div className="space-y-4">
                 {lessonsHistory.map((lesson) => (
                   <Card key={lesson.id} className="p-4 shadow-sm">
                     <div className="flex justify-between items-start mb-2">
                       <div>
                         <div className="font-semibold">{lesson.group_name || "-"}</div>
                         <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                           <CalendarDays className="h-3 w-3" />
                           {formatDate(lesson.datetime, lang)}
                         </div>
                       </div>
                       <Badge variant={lesson.status === "conducted" ? "default" : "destructive"}>
                         {lesson.status === "conducted" ? labels.status.active : labels.status.cancelled}
                       </Badge>
                     </div>
                     <div className="text-sm font-medium mt-3 mb-1">{lesson.topic || "Mavzu yo'q"}</div>
                     <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                       <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" /> {lesson.total_students} {labels.students}</span>
                       <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                         {lesson.present_count} keldi
                       </span>
                     </div>
                   </Card>
                 ))}
               </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PenaltiesTab({ labels }: { labels: ReturnType<typeof pageLabels> }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState("all");
  
  const [penalties, setPenalties] = useState<StaffPenalty[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; fullName: string; role: string; branchId?: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [detailForm, setDetailForm] = useState<FormState>(emptyForm);

  const isWriteAllowed = user?.role === "director" || user?.role === "superadmin" || user?.role === "admin";

  const staffList = useMemo(() => staff.filter((item) => item.role !== "director"), [staff]);
  const staffById = useMemo(() => Object.fromEntries(staff.map((item) => [item.id, item])), [staff]);
  const branchById = useMemo(() => Object.fromEntries(branches.map((item) => [item.id, item])), [branches]);
  const selected = useMemo(() => penalties.find((item) => item.id === selectedId) ?? null, [penalties, selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const mapPenaltyToFrontend = (p: any): StaffPenalty => ({
    id: p.id,
    staffId: p.staff,
    branchId: p.branch || undefined,
    amount: Number(p.amount),
    reason: p.reason,
    penaltyDate: p.penalty_date,
    status: p.status,
    comment: p.comment || undefined,
    createdByName: p.created_by_name || undefined,
  });

  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [staffRes, branchesRes] = await Promise.all([
          staffApi.list(),
          branchApi.list(),
        ]);
        const staffListRaw = Array.isArray(staffRes) ? staffRes : (staffRes as any).results ?? [];
        const branchesListRaw = Array.isArray(branchesRes) ? branchesRes : (branchesRes as any).results ?? [];

        setStaff(staffListRaw.map((item: any) => ({
          id: item.id,
          fullName: item.full_name,
          role: item.role,
          branchId: item.branch || undefined,
        })));
        setBranches(branchesListRaw.map((item: any) => ({
          id: item.id,
          name: item.name,
        })));
      } catch (err) {
        console.error(err);
      }
    };
    loadStaticData();
  }, []);

  const loadPenalties = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status !== "all") params.status = status;
      if (branchId !== "all") params.branch_id = branchId;
      if (month) {
        params.date_from = `${month}-01`;
        params.date_to = `${month}-31`;
      }
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      const res = await penaltyApi.list(params);
      const listRaw = Array.isArray(res) ? res : (res as any).results ?? [];
      setPenalties(listRaw.map(mapPenaltyToFrontend));
    } catch (err) {
      console.error(err);
      toast.error("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPenalties();
  }, [status, branchId, month, debouncedSearch]);

  const totals = useMemo(() => {
    const active = penalties.filter((penalty) => penalty.status === "active");
    return {
      all: penalties.length,
      active: active.length,
      cancelled: penalties.filter((penalty) => penalty.status === "cancelled").length,
      amount: active.reduce((sum, penalty) => sum + penalty.amount, 0),
    };
  }, [penalties]);

  const openCreate = () => {
    const firstStaff = staffList[0];
    setForm({
      ...emptyForm,
      staffId: firstStaff?.id ?? "",
      branchId: firstStaff?.branchId ?? branches[0]?.id ?? "",
      penaltyDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  const saveNew = async () => {
    if (!form.staffId || !Number(form.amount) || !form.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    const member = staffById[form.staffId];
    try {
      await penaltyApi.create({
        staff: form.staffId,
        branch: form.branchId || member?.branchId || null,
        amount: Number(form.amount),
        reason: form.reason.trim(),
        penalty_date: form.penaltyDate,
        status: form.status,
        comment: form.comment.trim() || undefined,
      });
      setDialogOpen(false);
      toast.success(labels.created);
      loadPenalties();
    } catch (err) {
      console.error(err);
      toast.error("Xatolik yuz berdi");
    }
  };

  const openDetail = (penalty: StaffPenalty) => {
    setSelectedId(penalty.id);
    setDetailForm({
      staffId: penalty.staffId,
      branchId: penalty.branchId ?? "",
      amount: String(penalty.amount),
      reason: penalty.reason,
      penaltyDate: penalty.penaltyDate,
      status: penalty.status,
      comment: penalty.comment ?? "",
    });
  };

  const saveDetail = async () => {
    if (!selected) return;
    if (!detailForm.staffId || !Number(detailForm.amount) || !detailForm.reason.trim()) {
      toast.error(labels.required);
      return;
    }
    const member = staffById[detailForm.staffId];
    try {
      await penaltyApi.update(selected.id, {
        staff: detailForm.staffId,
        branch: detailForm.branchId || member?.branchId || null,
        amount: Number(detailForm.amount),
        reason: detailForm.reason.trim(),
        penalty_date: detailForm.penaltyDate,
        status: detailForm.status,
        comment: detailForm.comment.trim() || undefined,
      });
      setSelectedId(null);
      toast.success(labels.saved);
      loadPenalties();
    } catch (err) {
      console.error(err);
      toast.error("Xatolik yuz berdi");
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    try {
      await penaltyApi.delete(selected.id);
      setSelectedId(null);
      toast.success(labels.deleted);
      loadPenalties();
    } catch (err) {
      console.error(err);
      toast.error("Xatolik yuz berdi");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{labels.title}</h3>
        {isWriteAllowed && (
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="mr-1 size-4" /> {labels.add}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Kpi icon={Ban} label={labels.kpiAmount} value={formatMoney(totals.amount, lang)} tone="danger" />
        <Kpi icon={CircleMinus} label={labels.kpiActive} value={String(totals.active)} />
        <Kpi icon={CalendarDays} label={labels.kpiMonth} value={month || labels.allMonths} />
        <Kpi icon={UserRound} label={labels.kpiRecords} value={String(totals.all)} />
      </div>

      <Card className="overflow-hidden shadow-elegant">
        <div className="grid gap-3 border-b border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} className="pl-9" />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allStatuses}</SelectItem>
              <SelectItem value="active">{labels.status.active}</SelectItem>
              <SelectItem value="cancelled">{labels.status.cancelled}</SelectItem>
            </SelectContent>
          </Select>
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
                <TableHead>{labels.reason}</TableHead>
                <TableHead>{labels.date}</TableHead>
                <TableHead>{labels.statusLabel}</TableHead>
                <TableHead className="text-right">{labels.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {penalties.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{labels.empty}</TableCell></TableRow>
              ) : penalties.map((penalty) => {
                const member = staffById[penalty.staffId];
                return (
                  <TableRow key={penalty.id} className="cursor-pointer hover:bg-accent/40" onClick={() => openDetail(penalty)}>
                    <TableCell>
                      <div className="font-medium">{member?.fullName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{penalty.branchId ? branchById[penalty.branchId]?.name ?? "-" : "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{penalty.reason}</div>
                      {penalty.comment && <div className="line-clamp-1 text-xs text-muted-foreground">{penalty.comment}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(penalty.penaltyDate, lang)}</TableCell>
                    <TableCell><StatusBadge status={penalty.status} labels={labels.status} /></TableCell>
                    <TableCell className="text-right font-semibold text-destructive">-{formatMoney(penalty.amount, lang)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PenaltyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        staff={staffList}
        branches={branches}
        labels={labels}
        onSubmit={saveNew}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected ? staffById[selected.staffId]?.fullName ?? labels.detail : labels.detail}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <PenaltyForm form={detailForm} setForm={setDetailForm} staff={staffList} branches={branches} labels={labels} disabled={!isWriteAllowed} />
          </div>
          <SheetFooter className="mt-6 gap-2 sm:justify-between sm:space-x-0">
            {isWriteAllowed ? (
              <>
                <Button variant="destructive" onClick={removeSelected}>
                  <Trash2 className="mr-1 size-4" /> {labels.delete}
                </Button>
                <Button onClick={saveDetail}>
                  <Edit3 className="mr-1 size-4" /> {labels.save}
                </Button>
              </>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setSelectedId(null)}>
                {labels.cancel}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PenaltyDialog({
  open,
  onOpenChange,
  form,
  setForm,
  staff,
  branches,
  labels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: (form: FormState) => void;
  staff: Array<{ id: string; fullName: string; branchId?: string }>;
  branches: Array<{ id: string; name: string }>;
  labels: ReturnType<typeof pageLabels>;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.addTitle}</DialogTitle>
          <DialogDescription>{labels.addDescription}</DialogDescription>
        </DialogHeader>
        <PenaltyForm form={form} setForm={setForm} staff={staff} branches={branches} labels={labels} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
          <Button onClick={onSubmit}>{labels.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PenaltyForm({
  form,
  setForm,
  staff,
  branches,
  labels,
  disabled = false,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  staff: Array<{ id: string; fullName: string; branchId?: string }>;
  branches: Array<{ id: string; name: string }>;
  labels: ReturnType<typeof pageLabels>;
  disabled?: boolean;
}) {
  const selectStaff = (staffId: string) => {
    const member = staff.find((item) => item.id === staffId);
    setForm({ ...form, staffId, branchId: member?.branchId ?? form.branchId });
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{labels.staff}</Label>
          <Select value={form.staffId} onValueChange={selectStaff} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder={labels.selectStaff} /></SelectTrigger>
            <SelectContent>
              {staff.map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.branch}</Label>
          <Select value={form.branchId || "none"} onValueChange={(value) => setForm({ ...form, branchId: value === "none" ? "" : value })} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{labels.notSelected}</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{labels.amount}</Label>
          <Input type="number" min={0} step={1000} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.date}</Label>
          <Input type="date" value={form.penaltyDate} onChange={(event) => setForm({ ...form, penaltyDate: event.target.value })} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.statusLabel}</Label>
          <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as StaffPenaltyStatus })} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{labels.status.active}</SelectItem>
              <SelectItem value="cancelled">{labels.status.cancelled}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{labels.reason}</Label>
        <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={labels.reasonPlaceholder} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label>{labels.comment}</Label>
        <Textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder={labels.commentPlaceholder} rows={4} disabled={disabled} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: { icon: typeof Ban; label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <Card className="p-4 shadow-elegant">
      <div className={`flex size-9 items-center justify-center rounded-lg ${tone === "danger" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function StatusBadge({ status, labels }: { status: StaffPenaltyStatus; labels: Record<StaffPenaltyStatus, string> }) {
  return (
    <Badge variant="outline" className={status === "active" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-muted-foreground/30 text-muted-foreground"}>
      {labels[status]}
    </Badge>
  );
}

function pageLabels(lang: "uz" | "ru") {
  if (lang === "ru") {
    return {
      pageTitle: "Контроль",
      pageSubtitle: "Эффективность учителей и система штрафов",
      tabTeachers: "Учителя",
      tabPenalties: "Штрафы",
      lessonConversion: "Конверсия уроков",
      attendance: "Посещаемость",
      lates: "Опоздания",
      students: "Студенты",
      searchTeacher: "Поиск учителя...",
      
      title: "Штрафы сотрудников",
      add: "Новый штраф",
      addTitle: "Новый штраф",
      addDescription: "Укажите сотрудника, сумму, дату и причину удержания.",
      search: "Поиск по сотруднику, телефону, причине или комментарию...",
      allStatuses: "Все статусы",
      allBranches: "Все филиалы",
      allMonths: "Все месяцы",
      kpiAmount: "Активные штрафы",
      kpiActive: "Активных записей",
      kpiMonth: "Период",
      kpiRecords: "Записей",
      staff: "Сотрудник",
      branch: "Филиал",
      reason: "Причина",
      date: "Дата",
      statusLabel: "Статус",
      amount: "Сумма",
      comment: "Комментарий",
      detail: "Детали",
      empty: "Данные не найдены",
      selectStaff: "Выберите сотрудника",
      notSelected: "Не выбрано",
      reasonPlaceholder: "Например: опоздание, нарушение регламента",
      commentPlaceholder: "Дополнительные детали",
      cancel: "Отмена",
      create: "Сохранить штраф",
      save: "Сохранить",
      delete: "Удалить",
      required: "Выберите сотрудника, сумму и причину",
      created: "Штраф сохранён",
      addPenalty: "Назначить штраф",
      emptyStateLine1: "Нет данных за этот месяц",
      emptyStateLine2: "Попробуйте выбрать другой месяц или филиал",
      saved: "Штраф обновлён",
      deleted: "Штраф удалён",
      status: {
        active: "Активный",
        cancelled: "Отменён",
      },
    };
  }

  return {
    pageTitle: "Nazorat",
    pageSubtitle: "O'qituvchilar samaradorligi va jarimalar tizimi",
    tabTeachers: "O'qituvchilar",
    tabPenalties: "Jarimalar",
    lessonConversion: "Darslar",
    attendance: "Davomat",
    lates: "Kechikishlar",
    students: "Talabalar",
    searchTeacher: "O'qituvchini qidirish...",
    
    title: "Xodim jarimalari",
    add: "Yangi jarima",
    addTitle: "Yangi jarima",
    addDescription: "Xodim, summa, sana va ushlab qolish sababini kiriting.",
    search: "Xodim, telefon, sabab yoki izoh bo'yicha qidirish...",
    allStatuses: "Barcha statuslar",
    allBranches: "Barcha filiallar",
    allMonths: "Barcha oylar",
    kpiAmount: "Faol jarimalar",
    kpiActive: "Faol yozuvlar",
    kpiMonth: "Davr",
    kpiRecords: "Yozuvlar",
    staff: "Xodim",
    branch: "Filial",
    reason: "Sabab",
    date: "Sana",
    statusLabel: "Status",
    amount: "Summa",
    comment: "Izoh",
    detail: "Tafsilotlar",
    empty: "Ma'lumotlar topilmadi",
    selectStaff: "Xodim tanlang",
    notSelected: "Tanlanmagan",
    reasonPlaceholder: "Masalan: kechikish, tartib buzilishi",
    commentPlaceholder: "Qo'shimcha ma'lumot",
    cancel: "Bekor qilish",
    create: "Jarimani saqlash",
    save: "Saqlash",
    delete: "O'chirish",
    required: "Xodim, summa va sababni kiriting",
    created: "Jarima saqlandi",
    addPenalty: "Jarima berish",
    emptyStateLine1: "Bu oy uchun ma'lumot yo'q",
    emptyStateLine2: "Boshqa oy yoki filialni tanlab ko'ring",
    saved: "Jarima yangilandi",
    deleted: "Jarima o'chirildi",
    status: {
      active: "Faol",
      cancelled: "Bekor qilingan",
    },
  };
}

