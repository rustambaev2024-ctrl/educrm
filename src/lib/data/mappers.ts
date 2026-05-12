// snake_case backend -> camelCase frontend domain types

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractId(value: string | { id: string } | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id;
}

export function toResults<T>(data: { results: T[] } | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.results;
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface BranchRaw {
  id: string;
  name: string;
  address: string;
  working_hours?: string;
  work_schedule?: Record<string, string>;
  status?: string;
}

export function mapBranch(r: BranchRaw) {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    workingHours: r.working_hours ?? "",
    workSchedule: r.work_schedule ?? {},
    status: r.status ?? "active",
  };
}

export function mapBranches(data: { results: BranchRaw[] } | BranchRaw[]) {
  return toResults(data).map(mapBranch);
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export interface RoomRaw {
  id: string;
  branch: string | { id: string };
  name: string;
  capacity: number;
  is_active?: boolean;
}

export function mapRoom(r: RoomRaw) {
  return {
    id: r.id,
    branchId: extractId(r.branch),
    name: r.name,
    capacity: r.capacity,
    isActive: r.is_active ?? true,
  };
}

export function mapRooms(data: { results: RoomRaw[] } | RoomRaw[]) {
  return toResults(data).map(mapRoom);
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export interface StaffRaw {
  id: string;
  user_id?: string;
  full_name: string;
  phone: string;
  role: string;
  branch: string | { id: string } | null;
  status: string;
  photo?: string | null;
  hired_at?: string | null;
  hire_date?: string | null;
  salary_percent: number | string | null;
  fixed_salary?: number | string | null;
}

export function mapStaff(r: StaffRaw) {
  return {
    id: r.id,
    userId: r.user_id ?? "",
    fullName: r.full_name,
    phone: r.phone,
    role: r.role === "branch_admin" ? "admin" : r.role,
    branchId: extractId(r.branch),
    status: r.status,
    photo: r.photo ?? null,
    hiredAt: r.hired_at ?? r.hire_date ?? null,
    salaryPercent: r.salary_percent === null ? null : Number(r.salary_percent),
    fixedSalary: r.fixed_salary ? Number(r.fixed_salary) : undefined,
  };
}

export function mapStaffList(data: { results: StaffRaw[] } | StaffRaw[]) {
  return toResults(data).map(mapStaff);
}

export interface StaffPenaltyRaw {
  id: string;
  staff: string | { id: string };
  branch?: string | { id: string } | null;
  amount: string | number;
  reason: string;
  penalty_date: string;
  status: string;
  comment?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapStaffPenalty(r: StaffPenaltyRaw) {
  return {
    id: r.id,
    staffId: extractId(r.staff),
    branchId: extractId(r.branch ?? undefined),
    amount: Number(r.amount),
    reason: r.reason,
    penaltyDate: r.penalty_date,
    status: r.status,
    comment: r.comment ?? undefined,
    createdByName: r.created_by_name ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapStaffPenalties(data: { results: StaffPenaltyRaw[] } | StaffPenaltyRaw[]) {
  return toResults(data).map(mapStaffPenalty);
}

// ─── Student ──────────────────────────────────────────────────────────────────

export interface StudentRaw {
  id: string;
  full_name: string;
  phone: string;
  photo?: string | null;
  branch: string | { id: string } | null;
  date_of_birth: string | null;
  status: string;
  wallet_balance: string | number;
  registered_at: string;
  notes: string | null;
  user_id: string;
  parent_id?: string | null;
  group_ids?: string[];
  documents?: Array<{
    id: string;
    name: string;
    doc_type?: string;
    file?: string | null;
    uploaded_at: string;
  }>;
}

export function mapStudent(r: StudentRaw) {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    photo: r.photo ?? undefined,
    branchId: extractId(r.branch),
    birthDate: r.date_of_birth ?? undefined,
    dateOfBirth: r.date_of_birth,
    status: r.status,
    balance: Number(r.wallet_balance),
    registeredAt: r.registered_at,
    notes: r.notes ?? "",
    userId: r.user_id,
    groupIds: r.group_ids ?? [],
    parentId: r.parent_id ?? undefined,
    documents: (r.documents ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      docType: document.doc_type,
      file: document.file ?? null,
      uploadedAt: document.uploaded_at,
    })),
  };
}

export function mapStudents(data: { results: StudentRaw[] } | StudentRaw[]) {
  return toResults(data).map(mapStudent);
}

// ─── Parent ───────────────────────────────────────────────────────────────────

export interface ParentRaw {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  children_ids: string[];
}

export function mapParent(r: ParentRaw) {
  return {
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    phone: r.phone,
    childrenIds: r.children_ids ?? [],
  };
}

export function mapParents(data: { results: ParentRaw[] } | ParentRaw[]) {
  return toResults(data).map(mapParent);
}

// ─── Course ───────────────────────────────────────────────────────────────────

export interface CourseRaw {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export function mapCourse(r: CourseRaw) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    createdAt: r.created_at,
  };
}

export function mapCourses(data: { results: CourseRaw[] } | CourseRaw[]) {
  return toResults(data).map(mapCourse);
}

// ─── Group ────────────────────────────────────────────────────────────────────

export interface GroupRaw {
  id: string;
  name: string;
  course: string | { id: string };
  branch: string | { id: string };
  teacher: string | { id: string } | null;
  room: string | { id: string } | null;
  capacity: number;
  start_date: string;
  end_date: string | null;
  monthly_price: string | number;
  status: string;
  schedule: Array<{ day?: number; day_of_week?: number; start?: string; end?: string; start_time?: string; end_time?: string }>;
  created_at: string;
  active_students_count: number;
  active_student_ids?: string[];
}

export function mapGroup(r: GroupRaw) {
  return {
    id: r.id,
    name: r.name,
    courseId: extractId(r.course),
    branchId: extractId(r.branch),
    teacherId: extractId(r.teacher ?? undefined),
    roomId: extractId(r.room ?? undefined),
    capacity: r.capacity,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    monthlyPrice: Number(r.monthly_price),
    status: r.status,
    schedule: r.schedule.map((slot) => ({
      day: slot.day ?? slot.day_of_week ?? 1,
      start: slot.start ?? slot.start_time ?? "",
      end: slot.end ?? slot.end_time ?? "",
    })),
    createdAt: r.created_at,
    activeStudentsCount: r.active_students_count,
    studentIds: r.active_student_ids ?? [],
  };
}

export function mapGroups(data: { results: GroupRaw[] } | GroupRaw[]) {
  return toResults(data).map(mapGroup);
}

// ─── Lesson ───────────────────────────────────────────────────────────────────

export interface LessonRaw {
  id: string;
  group: string | { id: string };
  datetime: string;
  room: string | { id: string } | null;
  teacher?: string | { id: string } | null;
  actual_teacher?: string | { id: string } | null;
  topic: string | null;
  status: string;
  cancel_reason: string | null;
}

export function mapLesson(r: LessonRaw) {
  return {
    id: r.id,
    groupId: extractId(r.group),
    datetime: r.datetime,
    durationMinutes: 90,
    roomId: extractId(r.room ?? undefined),
    teacherId: extractId(r.actual_teacher ?? r.teacher ?? undefined),
    topic: r.topic ?? "",
    status: r.status === "conducted" ? "completed" : r.status,
    cancelReason: r.cancel_reason ?? undefined,
  };
}

export function mapLessons(data: { results: LessonRaw[] } | LessonRaw[]) {
  return toResults(data).map(mapLesson);
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceRaw {
  id: string;
  lesson: string | { id: string };
  student: string | { id: string };
  status: string;
  late_minutes: number | null;
  comment: string | null;
}

export function mapAttendance(r: AttendanceRaw) {
  return {
    id: r.id,
    lessonId: extractId(r.lesson),
    studentId: extractId(r.student),
    status: r.status,
    lateMinutes: r.late_minutes,
    comment: r.comment ?? undefined,
  };
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface PaymentRaw {
  id: string;
  student: string | { id: string } | null;
  branch?: string | { id: string } | null;
  group: string | { id: string } | null;
  staff?: string | { id: string } | null;
  transaction_type?: string;
  payment_type?: string;
  type?: string;
  method?: string | null;
  category?: string | null;
  amount: string | number;
  created_at?: string;
  date?: string;
  comment: string | null;
}

export function mapPayment(r: PaymentRaw) {
  const transactionType = r.transaction_type ?? r.payment_type ?? r.type ?? "top_up";
  const direction =
    transactionType === "expense" || transactionType === "refund"
      ? "out"
      : transactionType === "charge" || transactionType === "discount"
        ? "internal"
        : "in";
  return {
    id: r.id,
    studentId: extractId(r.student ?? undefined),
    groupId: extractId(r.group ?? undefined),
    staffId: extractId(r.staff ?? undefined),
    branchId: extractId(r.branch ?? undefined),
    type: transactionType,
    direction,
    method: r.method ?? "cash",
    amount: Number(r.amount),
    date: r.created_at ?? r.date ?? new Date().toISOString(),
    comment: r.comment ?? undefined,
    category: r.category ?? (direction === "out" ? "other" : "tuition"),
  };
}

export function mapPayments(data: { results: PaymentRaw[] } | PaymentRaw[]) {
  return toResults(data).map(mapPayment);
}

// ─── Homework ─────────────────────────────────────────────────────────────────

export interface HomeworkRaw {
  id: string;
  title: string;
  description: string | null;
  group: string | { id: string } | null;
  lesson: string | { id: string } | null;
  deadline: string | null;
  file_url?: string | null;
  file?: string | null;
  created_at: string;
  created_by?: string | { id: string } | null;
}

export function mapHomework(r: HomeworkRaw) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    groupId: extractId(r.group ?? undefined),
    lessonId: extractId(r.lesson ?? undefined),
    teacherId: extractId(r.created_by ?? undefined),
    assignedAt: r.created_at,
    dueDate: r.deadline ?? r.created_at,
    deadline: r.deadline,
    fileUrl: r.file_url ?? r.file ?? null,
    createdAt: r.created_at,
  };
}

export function mapHomeworks(data: { results: HomeworkRaw[] } | HomeworkRaw[]) {
  return toResults(data).map(mapHomework);
}

// ─── Homework Submission ──────────────────────────────────────────────────────

export interface HomeworkSubmissionRaw {
  id: string;
  homework: string | { id: string };
  student: string | { id: string };
  status: string;
  answer_text?: string;
  submitted_at: string | null;
  grade: number | null;
  teacher_comment: string;
}

export function mapHomeworkSubmission(r: HomeworkSubmissionRaw) {
  return {
    id: r.id,
    homeworkId: extractId(r.homework),
    studentId: extractId(r.student),
    status: r.status,
    comment: r.answer_text ?? undefined,
    submittedAt: r.submitted_at ?? undefined,
    grade: r.grade ?? undefined,
    feedback: r.teacher_comment || undefined,
    attachments: [],
  };
}

export function mapHomeworkSubmissions(data: { results: HomeworkSubmissionRaw[] } | HomeworkSubmissionRaw[]) {
  return toResults(data).map(mapHomeworkSubmission);
}

// ─── Grade ────────────────────────────────────────────────────────────────────

export interface GradeRaw {
  id: string;
  student: string | { id: string };
  group: string | { id: string };
  grade_type?: string;
  type?: string;
  score: number;
  comment: string | null;
  graded_at?: string;
  created_at?: string;
  graded_by?: string | { id: string } | null;
}

export function mapGrade(r: GradeRaw) {
  const type = r.grade_type ?? r.type ?? "exam";
  const rawScore = Number(r.score);
  const normalizedScore = rawScore > 10 ? Math.round((rawScore / 100) * 10) : rawScore;
  return {
    id: r.id,
    studentId: extractId(r.student),
    groupId: extractId(r.group),
    teacherId: extractId(r.graded_by ?? undefined),
    kind: type,
    type,
    title: type,
    score: normalizedScore,
    maxScore: 10,
    date: r.graded_at ?? r.created_at ?? new Date().toISOString(),
    comment: r.comment ?? undefined,
    createdAt: r.graded_at ?? r.created_at ?? new Date().toISOString(),
  };
}

export function mapGrades(data: { results: GradeRaw[] } | GradeRaw[]) {
  return toResults(data).map(mapGrade);
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface NotificationRaw {
  id: string;
  notification_type?: string;
  type?: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function mapNotification(r: NotificationRaw) {
  return {
    id: r.id,
    kind: r.notification_type ?? r.type ?? "system",
    type: r.notification_type ?? r.type ?? "system",
    title: r.title,
    body: r.body,
    read: r.is_read,
    isRead: r.is_read,
    createdAt: r.created_at,
    audience: [] as string[],
  };
}

export function mapNotifications(data: { results: NotificationRaw[] } | NotificationRaw[]) {
  return toResults(data).map(mapNotification);
}

// ─── Institution (superadmin) ─────────────────────────────────────────────────

export interface InstitutionRaw {
  id: string;
  name: string;
  slug?: string;
  schema_name: string;
  primary_domain?: string | null;
  logo: string | null;
  address?: string;
  subscription_end?: string | null;
  status: string;
  created_at: string;
  student_count?: number;
  students_count?: number;
  branch_count?: number;
  branches_count?: number;
  staff_count?: number;
  monthly_revenue?: string | number;
  director_name?: string | null;
  director_login?: string | null;
}

export function mapInstitution(r: InstitutionRaw) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug ?? r.schema_name,
    schemaName: r.schema_name,
    domain: r.primary_domain ?? "",
    logo: r.logo,
    status: r.status,
    createdAt: r.created_at,
    studentCount: r.student_count ?? r.students_count ?? 0,
    branchCount: r.branch_count ?? r.branches_count ?? 0,
    studentsCount: r.student_count ?? r.students_count ?? 0,
    branchesCount: r.branch_count ?? r.branches_count ?? 0,
  };
}

export function mapInstitutions(data: { results: InstitutionRaw[] } | InstitutionRaw[]) {
  return toResults(data).map(mapInstitution);
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditRaw {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
}

export function mapAuditLog(r: AuditRaw) {
  return {
    id: r.id,
    actorId: r.actor_id ?? "",
    actorName: r.actor_name ?? "System",
    actorRole: r.user_role || "director",
    action: r.action,
    entity: r.entity_type,
    entityId: r.entity_id || undefined,
    summary: `${r.action} ${r.entity_type}`,
    createdAt: r.timestamp,
  };
}

export function mapAuditLogs(data: { results: AuditRaw[] } | AuditRaw[]) {
  return toResults(data).map(mapAuditLog);
}
