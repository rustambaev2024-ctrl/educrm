import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  attendanceApi,
  authApi,
  auditApi,
  branchApi,
  chatApi,
  courseApi,
  gradeApi,
  groupApi,
  homeworkApi,
  lessonApi,
  notificationApi,
  parentApi,
  penaltyApi,
  paymentApi,
  requestJson,
  roomApi,
  staffApi,
  studentApi,
  superadminApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  mapBranches,
  mapAuditLogs,
  mapCourses,
  mapGrades,
  mapGroups,
  mapAttendance,
  mapHomeworkSubmissions,
  mapHomeworks,
  mapInstitutions,
  mapLessons,
  mapNotifications,
  mapParents,
  mapPayments,
  mapRooms,
  mapStaffList,
  mapStaffPenalties,
  mapStudents,
  toResults,
  type AuditRaw,
  type AttendanceRaw,
  type BranchRaw,
  type CourseRaw,
  type GradeRaw,
  type GroupRaw,
  type HomeworkSubmissionRaw,
  type HomeworkRaw,
  type InstitutionRaw,
  type LessonRaw,
  type NotificationRaw,
  type ParentRaw,
  type PaymentRaw,
  type RoomRaw,
  type StaffRaw,
  type StaffPenaltyRaw,
  type StudentRaw,
} from "@/lib/data/mappers";
import { openNotificationSocket } from "@/lib/realtime";
import type {
  Branch,
  AttendanceRecord,
  AttendanceStatus,
  AppNotification,
  ChatMessage,
  ChatThread,
  Course,
  DayOfWeek,
  Grade,
  Group,
  Homework,
  HomeworkSubmission,
  HomeworkSubmissionStatus,

  Lesson,
  Parent,
  Payment,
  Room,
  Staff,
  StaffPenalty,
  Student,
  AuditEntry,
  Institution,
} from "./types";

// Temporary local UI state without demo seed data.
// During backend phases this provider will be progressively replaced with API-powered queries/mutations.

interface DataStoreState {
  branches: Branch[];
  rooms: Room[];
  courses: Course[];
  staff: Staff[];
  parents: Parent[];
  students: Student[];
  groups: Group[];
  lessons: Lesson[];
  attendance: AttendanceRecord[];
  payments: Payment[];
  penalties: StaffPenalty[];

  threads: ChatThread[];
  messages: ChatMessage[];
  notifications: AppNotification[];
  homework: Homework[];
  submissions: HomeworkSubmission[];
  grades: Grade[];
  auditLog: AuditEntry[];
  institutions: Institution[];
  isLoading: boolean;
  loadError: string | null;
}

type AddStudentInput = Omit<Student, "id" | "registeredAt" | "balance" | "groupIds" | "status"> & {
  parentName?: string;
  parentPhone?: string;
  parentPassword?: string;
  documentFile?: File;
  documentType?: string;
};

interface DataStoreActions {
  reload: () => Promise<void>;
  addStudent: (input: AddStudentInput) => Student;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  archiveStudent: (id: string) => void;
  deleteStudent: (id: string, deleteParent?: boolean) => void;
  syncParentChild: (studentId: string) => Promise<void>;
  assignParent: (studentId: string, parentData: {
    parentId?: string;
    parentName?: string;
    parentPhone?: string;
    parentPassword?: string;
  }) => Promise<void>;
  addGroup: (input: Omit<Group, "id" | "studentIds" | "status"> & { status?: Group["status"] }) => Group;
  updateGroup: (id: string, patch: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  addStudentToGroup: (groupId: string, studentId: string) => void;
  removeStudentFromGroup: (groupId: string, studentId: string) => void;
  setLessonStatus: (id: string, status: Lesson["status"], cancelReason?: string) => void;
  rescheduleLesson: (id: string, datetime: string) => void;
  addCourse: (input: Omit<Course, "id">) => Course;
  updateCourse: (id: string, patch: Partial<Omit<Course, "id">>) => void;
  deleteCourse: (id: string) => void;
  setAttendance: (lessonId: string, records: { studentId: string; status: AttendanceStatus; comment?: string }[]) => void;
  getAttendanceFor: (lessonId: string) => AttendanceRecord[];
  addPayment: (input: Omit<Payment, "id">) => Payment;
  reversePayment: (id: string) => Promise<void>;
  addPenalty: (input: Omit<StaffPenalty, "id" | "createdAt" | "updatedAt">) => StaffPenalty;
  updatePenalty: (id: string, patch: Partial<StaffPenalty>) => void;
  deletePenalty: (id: string) => void;

  loadThreadMessages: (threadId: string) => void;
  startDirectChat: (userId: string, chatType?: string) => Promise<string | null>;
  sendMessage: (threadId: string, authorId: string, authorName: string, text: string) => void;
  receiveChatMessage: (threadId: string, payload: unknown) => void;
  markThreadRead: (threadId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (audience: AppNotification["audience"][number]) => void;
  updateParentPassword: (parentId: string, password: string) => void;
  updateStudentPasswords: (id: string, password?: string, parentPassword?: string) => void;
  // Homework
  addHomework: (input: Omit<Homework, "id" | "assignedAt">) => Homework;
  updateSubmission: (
    homeworkId: string,
    studentId: string,
    patch: Partial<Omit<HomeworkSubmission, "id" | "homeworkId" | "studentId">>,
  ) => void;
  gradeSubmission: (
    homeworkId: string,
    studentId: string,
    grade: number,
    feedback?: string,
  ) => void;
  // Grades
  addGrade: (input: Omit<Grade, "id">) => Grade;
  updateGrade: (id: string, patch: Partial<Grade>) => void;
  deleteGrade: (id: string) => void;
  // Institutions (superadmin)
  addInstitution: (input: Omit<Institution, "id" | "createdAt" | "studentsCount" | "branchesCount" | "staffCount" | "monthlyRevenue"> & {
    studentsCount?: number;
    branchesCount?: number;
    staffCount?: number;
    monthlyRevenue?: number;
  }) => Institution;
  updateInstitution: (id: string, patch: Partial<Institution>) => void;
  deleteInstitution: (id: string) => void;
  // Branches (superadmin)
  addBranch: (input: Omit<Branch, "id">) => Branch;
  updateBranch: (id: string, patch: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  // Rooms (director)
  addRoom: (input: Omit<Room, "id">) => Room;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  // Staff (director)
  addStaff: (input: Omit<Staff, "id">) => Staff;
  updateStaff: (id: string, patch: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
}

type DataStoreValue = DataStoreState & DataStoreActions;

const DataContext = createContext<DataStoreValue | null>(null);

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
type ListResponse<T> = { results: T[]; count?: number } | T[];
type AnyRecord = Record<string, unknown>;

async function safe<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[store] failed to load ${label}:`, err);
    return fallback;
  }
}

function snake(obj: AnyRecord): AnyRecord {
  const result: AnyRecord = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    result[key.replace(/([A-Z])/g, "_$1").toLowerCase()] = value;
  }
  return result;
}

function fireAndForget(label: string, task: Promise<unknown>, rollback?: () => void) {
  task.catch((err) => {
    console.error(`[store] ${label} failed:`, err);
    rollback?.();
    toast.error(apiErrorMessage(err));
  });
}

function apiErrorMessage(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (typeof body === "string" && body.trim()) {
    return friendlyApiMessage(body);
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const direct = record.detail ?? record.error ?? record.message ?? record.non_field_errors;
    const message = firstText(direct) ?? firstText(Object.values(record));
    if (message) return friendlyApiMessage(message);
  }
  return "Amalni bajarib bo'lmadi. Ma'lumotlarni tekshirib, qayta urinib ko'ring.";
}

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstText(item);
      if (found) return found;
    }
  }
  return null;
}
function friendlyApiMessage(message: string): string {
  if (message.includes("РќРµ") || message.includes("Р Сњ")) {
    return "Amalni bajarib bo'lmadi. Ma'lumotlarni tekshirib, qayta urinib ko'ring.";
  }
  if (message.includes("Group has lessons and cannot be deleted")) {
    return "Bu guruhda darslar bor. Uni o'chirib bo'lmaydi. Guruhni tugallangan holatiga o'tkazing.";
  }
  if (message.includes("Group has active students and cannot be deleted")) {
    return "Bu guruhda faol o'quvchilar bor. Avval o'quvchilarni guruhdan olib tashlang.";
  }
  if (message.includes("Course has groups and cannot be deleted")) {
    return "Bu kursga guruhlar biriktirilgan. Avval guruhlarni tugallang yoki boshqa kursga o'tkazing.";
  }
  return message;
}

function roleAudience(role?: string): AppNotification["audience"][number] {
  if (role === "branch_admin") return "admin";
  if (role === "superadmin" || role === "director" || role === "admin" || role === "teacher" || role === "student" || role === "parent") {
    return role;
  }
  return "student";
}

function normalizeDay(day: unknown): DayOfWeek {
  const n = Number(day);
  if (n >= 1 && n <= 7) return n as DayOfWeek;
  if (n >= 0 && n <= 6) return (n + 1) as DayOfWeek;
  return 1;
}

function toStudentStatus(value: unknown): Student["status"] {
  const allowed: Student["status"][] = ["active", "frozen", "debtor", "archived", "graduate", "expelled"];
  return allowed.includes(value as Student["status"]) ? (value as Student["status"]) : "active";
}

function toGroupStatus(value: unknown): Group["status"] {
  const allowed: Group["status"][] = ["recruiting", "active", "frozen", "completed"];
  return allowed.includes(value as Group["status"]) ? (value as Group["status"]) : "recruiting";
}

function toLessonStatus(value: unknown): Lesson["status"] {
  const normalized = value === "conducted" ? "completed" : value;
  const allowed: Lesson["status"][] = ["scheduled", "completed", "cancelled", "rescheduled"];
  return allowed.includes(normalized as Lesson["status"]) ? (normalized as Lesson["status"]) : "scheduled";
}

function toNotificationKind(value: unknown): AppNotification["kind"] {
  const v = String(value ?? "");
  if (v === "new_message") return "message";
  if (v === "payment_due") return "payment";
  if (v === "new_homework") return "homework";
  if (v.includes("attendance")) return "attendance";
  if (v.includes("debtor")) return "debtor";
  if (v.startsWith("lesson_")) return "lesson";
  return "system";
}

function toGradeKind(value: unknown): Grade["kind"] {
  const allowed: Grade["kind"][] = ["lesson", "homework", "exam", "activity"];
  return allowed.includes(value as Grade["kind"]) ? (value as Grade["kind"]) : "exam";
}

function toStaffRole(value: unknown): Staff["role"] {
  if (value === "director" || value === "teacher") return value;
  return "admin";
}

function toPaymentMethod(value: unknown): Payment["method"] {
  const allowed: Payment["method"][] = ["cash", "card", "transfer", "click", "payme"];
  return allowed.includes(value as Payment["method"]) ? (value as Payment["method"]) : "cash";
}

function toInstitutionPlan(value: unknown): Institution["plan"] {
  const allowed: Institution["plan"][] = ["basic", "standard", "pro"];
  return allowed.includes(value as Institution["plan"]) ? (value as Institution["plan"]) : "standard";
}

function toInstitutionStatus(value: unknown): Institution["status"] {
  const allowed: Institution["status"][] = ["active", "frozen", "archived"];
  return allowed.includes(value as Institution["status"]) ? (value as Institution["status"]) : "active";
}

function branchFromRaw(raw: BranchRaw): Branch {
  const mapped = mapBranches([raw])[0];
  return { id: mapped.id, name: mapped.name, address: mapped.address };
}

function roomFromRaw(raw: RoomRaw): Room {
  const mapped = mapRooms([raw])[0];
  return {
    id: mapped.id,
    name: mapped.name,
    branchId: mapped.branchId,
    capacity: mapped.capacity,
  };
}

function courseFromRaw(raw: CourseRaw): Course {
  const mapped = mapCourses([raw])[0];
  return { id: mapped.id, name: mapped.name, description: mapped.description };
}

function parentFromRaw(raw: ParentRaw): Parent {
  const mapped = mapParents([raw])[0];
  return {
    id: mapped.id,
    fullName: mapped.fullName,
    phone: mapped.phone,
    childrenIds: mapped.childrenIds,
    userId: mapped.userId,
  };
}

function staffFromRaw(raw: StaffRaw): Staff {
  const mapped = mapStaffList([raw])[0];
  return {
    id: mapped.id,
    userId: mapped.userId,
    fullName: mapped.fullName,
    phone: mapped.phone,
    role: toStaffRole(mapped.role),
    branchId: mapped.branchId || undefined,
    salaryPercent: mapped.salaryPercent,
    fixedSalary: mapped.fixedSalary,
  };
}

function studentFromRaw(raw: StudentRaw): Student {
  const mapped = mapStudents([raw])[0];
  return {
    id: mapped.id,
    userId: mapped.userId,
    fullName: mapped.fullName,
    phone: mapped.phone,
    birthDate: mapped.birthDate,
    branchId: mapped.branchId,
    status: toStudentStatus(mapped.status),
    registeredAt: mapped.registeredAt,
    balance: mapped.balance,
    groupIds: mapped.groupIds,
  };
}

function groupFromRaw(raw: GroupRaw): Group {
  const mapped = mapGroups([raw])[0];
  return {
    id: mapped.id,
    name: mapped.name,
    courseId: mapped.courseId,
    branchId: mapped.branchId,
    teacherId: mapped.teacherId,
    roomId: mapped.roomId,
    capacity: mapped.capacity,
    startDate: mapped.startDate,
    endDate: mapped.endDate,
    schedule: mapped.schedule.map((slot) => ({
      day: normalizeDay(slot.day),
      start: slot.start,
      end: slot.end,
    })),
    monthlyPrice: mapped.monthlyPrice,
    status: toGroupStatus(mapped.status),
    studentIds: mapped.studentIds,
  };
}

function lessonFromRaw(raw: LessonRaw): Lesson {
  const mapped = mapLessons([raw])[0];
  return {
    id: mapped.id,
    groupId: mapped.groupId,
    datetime: mapped.datetime,
    durationMinutes: mapped.durationMinutes,
    roomId: mapped.roomId,
    topic: mapped.topic,
    status: toLessonStatus(mapped.status),
    cancelReason: mapped.cancelReason,
  };
}

function attendanceFromRaw(raw: AttendanceRaw): AttendanceRecord {
  const mapped = mapAttendance(raw);
  const status = toAttendanceStatus(mapped.status);
  return {
    id: mapped.id,
    lessonId: mapped.lessonId,
    studentId: mapped.studentId,
    status,
    comment: mapped.comment,
  };
}

function toAttendanceStatus(value: unknown): AttendanceStatus {
  if (value === "present" || value === "absent" || value === "late" || value === "excused") {
    return value;
  }
  return "absent";
}

function paymentFromRaw(raw: PaymentRaw): Payment {
  const mapped = mapPayments([raw])[0];
  return {
    id: mapped.id,
    studentId: mapped.studentId || undefined,
    staffId: mapped.staffId || undefined,
    groupId: mapped.groupId || undefined,
    branchId: mapped.branchId || "",
    type: mapped.type,
    amount: mapped.amount,
    direction: mapped.direction as any,
    method: toPaymentMethod(mapped.method),
    date: mapped.date,
    comment: mapped.comment,
    category: toPaymentCategory(mapped.category),
  };
}

function toPaymentCategory(value: unknown): Payment["category"] {
  if (value === "tuition" || value === "salary" || value === "rent" || value === "utilities" || value === "marketing" || value === "other") {
    return value;
  }
  return "other";
}

function toPenaltyStatus(value: unknown): StaffPenalty["status"] {
  return value === "cancelled" ? "cancelled" : "active";
}

function penaltyFromRaw(raw: StaffPenaltyRaw): StaffPenalty {
  const mapped = mapStaffPenalties([raw])[0];
  return {
    id: mapped.id,
    staffId: mapped.staffId,
    branchId: mapped.branchId || undefined,
    amount: mapped.amount,
    reason: mapped.reason,
    penaltyDate: mapped.penaltyDate,
    status: toPenaltyStatus(mapped.status),
    comment: mapped.comment,
    createdByName: mapped.createdByName,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  };
}

function homeworkFromRaw(raw: HomeworkRaw): Homework {
  const mapped = mapHomeworks([raw])[0];
  return {
    id: mapped.id,
    groupId: mapped.groupId,
    teacherId: mapped.teacherId,
    title: mapped.title,
    description: mapped.description,
    assignedAt: mapped.assignedAt,
    dueDate: mapped.dueDate,
  };
}

function toSubmissionStatus(value: unknown): HomeworkSubmissionStatus {
  if (value === "checked") return "graded";
  if (value === "overdue") return "late";
  if (value === "not_submitted" || value === "revision") return "pending";
  if (value === "submitted") return "submitted";
  return "pending";
}

function submissionFromRaw(raw: HomeworkSubmissionRaw): HomeworkSubmission {
  const mapped = mapHomeworkSubmissions([raw])[0];
  return {
    id: mapped.id,
    homeworkId: mapped.homeworkId,
    studentId: mapped.studentId,
    status: toSubmissionStatus(mapped.status),
    submittedAt: mapped.submittedAt,
    comment: mapped.comment,
    grade: mapped.grade,
    feedback: mapped.feedback,
    attachments: [],
  };
}

function submissionPatchToApi(
  patch: Partial<Omit<HomeworkSubmission, "id" | "homeworkId" | "studentId">>,
) {
  const statusMap: Partial<Record<HomeworkSubmissionStatus, string>> = {
    pending: "not_submitted",
    submitted: "submitted",
    graded: "checked",
    late: "overdue",
  };
  return {
    ...(patch.status ? { status: statusMap[patch.status] ?? patch.status } : {}),
    ...(patch.comment !== undefined ? { answer_text: patch.comment } : {}),
    ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
    ...(patch.feedback !== undefined ? { teacher_comment: patch.feedback } : {}),
  };
}

function gradeFromRaw(raw: GradeRaw): Grade {
  const mapped = mapGrades([raw])[0];
  return {
    id: mapped.id,
    groupId: mapped.groupId,
    studentId: mapped.studentId,
    teacherId: mapped.teacherId,
    kind: toGradeKind(mapped.kind),
    title: mapped.title,
    score: mapped.score,
    maxScore: mapped.maxScore,
    date: mapped.date,
    comment: mapped.comment,
  };
}

function auditFromRaw(raw: AuditRaw): AuditEntry {
  const mapped = mapAuditLogs([raw])[0];
  return {
    id: mapped.id,
    actorId: mapped.actorId,
    actorName: mapped.actorName,
    actorRole: roleAudience(mapped.actorRole) as AuditEntry["actorRole"],
    action: mapped.action as AuditEntry["action"],
    entity: mapped.entity,
    entityId: mapped.entityId,
    summary: mapped.summary,
    createdAt: mapped.createdAt,
  };
}

function notificationFromRaw(raw: NotificationRaw, audience: AppNotification["audience"][number]): AppNotification {
  const mapped = mapNotifications([raw])[0];
  return {
    id: mapped.id,
    kind: toNotificationKind(mapped.kind),
    title: mapped.title,
    body: mapped.body,
    createdAt: mapped.createdAt,
    read: mapped.read,
    audience: [audience],
  };
}

function institutionFromRaw(raw: InstitutionRaw): Institution {
  const mapped = mapInstitutions([raw])[0];
  const source = raw as InstitutionRaw & AnyRecord;
  return {
    id: mapped.id,
    name: mapped.name,
    slug: mapped.slug,
    schemaName: mapped.schemaName,
    domain: mapped.domain,
    city: String(source.city ?? source.address ?? ""),
    studentsCount: mapped.studentsCount,
    branchesCount: mapped.branchesCount,
    staffCount: Number(source.staff_count ?? source.staffCount ?? 0),
    plan: toInstitutionPlan(source.plan),
    status: toInstitutionStatus(mapped.status),
    monthlyRevenue: Number(source.monthly_revenue ?? source.monthlyRevenue ?? 0),
    expiresAt: String(source.expires_at ?? source.subscription_end ?? new Date().toISOString().slice(0, 10)),
    createdAt: mapped.createdAt,
    directorName: source.director_name ? String(source.director_name) : undefined,
    directorPhone: source.director_login ? String(source.director_login) : undefined,
  };
}

function mapChats(raw: unknown): ChatThread[] {
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { results?: unknown[] })?.results)
      ? (raw as { results: unknown[] }).results
      : [];
  return items.map((item) => {
    const chat = item as AnyRecord;
    const last = (chat.last_message ?? null) as AnyRecord | null;
    const scope = String(chat.scope ?? (chat.chat_type === "group_chat" ? "group" : "direct"));
    return {
      id: String(chat.id ?? ""),
      title: String(chat.title ?? chat.name ?? chat.chat_type ?? "Chat"),
      scope: scope === "broadcast" ? "broadcast" : scope === "group" ? "group" : "direct",
      participantIds: Array.isArray(chat.participants) ? (chat.participants as string[]) : [],
      groupId: chat.group ? String(chat.group) : undefined,
      lastMessageAt: String(chat.updated_at ?? chat.last_message_at ?? chat.created_at ?? new Date().toISOString()),
      lastMessage: last?.text ? String(last.text) : undefined,
      unread: Number(chat.unread_count ?? 0),
    };
  });
}

function chatMessageFromRealtime(raw: unknown, fallbackThreadId: string): ChatMessage {
  const payload = raw as AnyRecord;
  const sender = (payload.sender ?? {}) as AnyRecord;
  return {
    id: String(payload.id ?? uid("msg")),
    threadId: String(payload.chat_id ?? payload.threadId ?? fallbackThreadId),
    authorId: String(sender.id ?? payload.sender_id ?? payload.authorId ?? ""),
    authorName: String(sender.full_name ?? payload.authorName ?? "System"),
    authorRole: sender.role ? String(sender.role) : undefined,
    text: String(payload.is_deleted ? "" : payload.text ?? payload.content ?? ""),
    createdAt: String(payload.created_at ?? payload.createdAt ?? new Date().toISOString()),
    read: false,
    isEdited: Boolean(payload.is_edited),
    isDeleted: Boolean(payload.is_deleted),
  };
}

function isSameOptimisticMessage(existing: ChatMessage, incoming: ChatMessage) {
  if (!existing.id.startsWith("msg_")) return false;
  if (existing.threadId !== incoming.threadId || existing.text !== incoming.text) return false;
  if (existing.authorId && incoming.authorId && existing.authorId !== incoming.authorId) return false;
  return Math.abs(new Date(existing.createdAt).getTime() - new Date(incoming.createdAt).getTime()) < 10000;
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const currentAudience = roleAudience(user?.role);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [attendance, setAttendanceState] = useState<AttendanceRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [penalties, setPenalties] = useState<StaffPenalty[]>([]);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const lastReloadAtRef = useRef(0);

  const reload = useCallback(async () => {
    if (!isAuthenticated || loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      if (user?.role === "superadmin") {
        const institutionsRaw = await safe(
          superadminApi.institutions.list() as Promise<ListResponse<InstitutionRaw>>,
          [],
          "institutions",
        );
        const loadedInstitutions = toResults(institutionsRaw).map(institutionFromRaw);
        setInstitutions(loadedInstitutions);
        const branchGroups = await Promise.all(
          loadedInstitutions.map(async (institution) => {
            const rawBranches = await safe(
              superadminApi.branches.list(institution.id) as Promise<ListResponse<BranchRaw>>,
              [],
              `branches:${institution.id}`,
            );
            return toResults(rawBranches).map((raw) => ({
              ...branchFromRaw(raw),
              institutionId: institution.id,
            }));
          }),
        );
        setBranches(branchGroups.flat());
        return;
      }

      const canSeeStudents = ["director", "admin", "branch_admin", "teacher", "student", "parent"].includes(user?.role ?? "");
      const canSeeStaff = ["director", "admin", "branch_admin"].includes(user?.role ?? "");
      const canSeeFinance = ["director", "admin", "branch_admin"].includes(user?.role ?? "");
      const canSeePenalties = user?.role === "director";

      const [
        branchesRaw,
        roomsRaw,
        coursesRaw,
        groupsRaw,
        studentsRaw,
        staffRaw,
        parentsRaw,
        lessonsRaw,
        attendanceRaw,
        paymentsRaw,
        penaltiesRaw,
        homeworkRaw,
        submissionsRaw,
        gradesRaw,
        notificationsRaw,
        chatsRaw,
        auditRaw,
      ] = await Promise.all([
        safe(branchApi.list() as Promise<ListResponse<BranchRaw>>, [], "branches"),
        safe(roomApi.list() as Promise<ListResponse<RoomRaw>>, [], "rooms"),
        safe(courseApi.list() as Promise<ListResponse<CourseRaw>>, [], "courses"),
        safe(groupApi.list() as Promise<ListResponse<GroupRaw>>, [], "groups"),
        canSeeStudents ? safe(studentApi.list({ page_size: 1000 }) as Promise<ListResponse<StudentRaw>>, [], "students") : Promise.resolve([]),
        canSeeStaff ? safe(staffApi.list({ page_size: 1000 }) as Promise<ListResponse<StaffRaw>>, [], "staff") : Promise.resolve([]),
        canSeeStudents ? safe(parentApi.list({ page_size: 1000 }) as Promise<ListResponse<ParentRaw>>, [], "parents") : Promise.resolve([]),
        safe(lessonApi.list() as Promise<ListResponse<LessonRaw>>, [], "lessons"),
        safe(attendanceApi.list() as Promise<ListResponse<AttendanceRaw>>, [], "attendance"),
        (canSeeFinance || user?.role === "student" || user?.role === "parent")
          ? safe(paymentApi.list() as Promise<ListResponse<PaymentRaw>>, [], "payments")
          : Promise.resolve([]),
        canSeePenalties ? safe(penaltyApi.list() as Promise<ListResponse<StaffPenaltyRaw>>, [], "penalties") : Promise.resolve([]),
        safe(homeworkApi.list() as Promise<ListResponse<HomeworkRaw>>, [], "homework"),
        safe(homeworkApi.allSubmissions() as Promise<ListResponse<HomeworkSubmissionRaw>>, [], "homework submissions"),
        safe(gradeApi.list() as Promise<ListResponse<GradeRaw>>, [], "grades"),
        safe(notificationApi.list() as Promise<ListResponse<NotificationRaw>>, [], "notifications"),
        safe(chatApi.list(), [], "chats"),
        ["director", "superadmin"].includes(user?.role ?? "")
          ? safe(auditApi.list() as Promise<ListResponse<AuditRaw>>, [], "audit")
          : Promise.resolve([]),
      ]);

      setBranches(toResults(branchesRaw).map(branchFromRaw));
      setRooms(toResults(roomsRaw).map(roomFromRaw));
      setCourses(toResults(coursesRaw).map(courseFromRaw));
      setGroups(toResults(groupsRaw).map(groupFromRaw));
      const loadedParents = toResults(parentsRaw).map(parentFromRaw);
      setParents(loadedParents);
      setStudents(
        toResults(studentsRaw).map((raw) => {
          const student = studentFromRaw(raw);
          const parent = loadedParents.find((item) => item.childrenIds.includes(student.id));
          return parent ? { ...student, parentId: parent.id } : student;
        }),
      );
      setStaff(toResults(staffRaw).map(staffFromRaw));
      setLessons(toResults(lessonsRaw).map(lessonFromRaw));
      setAttendanceState(toResults(attendanceRaw).map(attendanceFromRaw));
      setPayments(toResults(paymentsRaw).map(paymentFromRaw));
      setPenalties(toResults(penaltiesRaw).map(penaltyFromRaw));
      setHomework(toResults(homeworkRaw).map(homeworkFromRaw));
      setSubmissions(toResults(submissionsRaw).map(submissionFromRaw));
      setGrades(toResults(gradesRaw).map(gradeFromRaw));
      setNotifications(toResults(notificationsRaw).map((item) => notificationFromRaw(item, currentAudience)));
      setThreads(mapChats(chatsRaw));
      setAuditLog(toResults(auditRaw).map(auditFromRaw));
    } catch (err) {
      console.error("[store] reload failed:", err);
      setLoadError("Ma'lumotlarni yuklab bo'lmadi");
    } finally {
      lastReloadAtRef.current = Date.now();
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [currentAudience, isAuthenticated, user?.role]);

  useEffect(() => {
    if (isAuthenticated) void reload();
  }, [isAuthenticated, reload]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const reloadFreshData = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastReloadAtRef.current < 15000) return;
      void reload();
    };

    window.addEventListener("focus", reloadFreshData);
    document.addEventListener("visibilitychange", reloadFreshData);
    return () => {
      window.removeEventListener("focus", reloadFreshData);
      document.removeEventListener("visibilitychange", reloadFreshData);
    };
  }, [isAuthenticated, reload]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const handle = openNotificationSocket({
      onNotification: (payload) => {
        const notification = notificationFromRaw(payload as unknown as NotificationRaw, currentAudience);
        setNotifications((prev) => {
          const exists = prev.some((item) => item.id === notification.id);
          if (exists) return prev.map((item) => (item.id === notification.id ? notification : item));
          return [notification, ...prev];
        });
      },
    });
    return () => handle?.close();
  }, [currentAudience, isAuthenticated, user?.id]);

  const addStudent: DataStoreActions["addStudent"] = useCallback((input) => {
    const id = uid("st");
    let parentId: string | undefined;
    if (input.parentName && input.parentPhone) {
      const pid = uid("p");
      const newParent: Parent = {
        id: pid,
        fullName: input.parentName,
        phone: input.parentPhone,
        childrenIds: [id],
      };
      setParents((prev) => [...prev, newParent]);
      parentId = pid;
    }
    const created: Student = {
      id,
      fullName: input.fullName,
      phone: input.phone,
      birthDate: input.birthDate,
      photo: input.photo,
      branchId: input.branchId,
      status: "active",
      registeredAt: new Date().toISOString().slice(0, 10),
      balance: 0,
      groupIds: [],
      parentId,
      documents: input.documentFile
        ? [{
            id: uid("doc"),
            name: input.documentFile.name,
            docType: input.documentType ?? "passport",
            uploadedAt: new Date().toISOString(),
          }]
        : [],
    };
    setStudents((prev) => [created, ...prev]);
    const formData = new FormData();
    formData.append("full_name", created.fullName);
    formData.append("phone", created.phone);
    if (input.password) formData.append("password", input.password);
    // Отправляем branch только если он реально задан — иначе backend подставит
    // филиал из профиля сотрудника (perform_create), а не запишет пустую строку.
    if (created.branchId) formData.append("branch", created.branchId);
    if (created.birthDate) formData.append("date_of_birth", created.birthDate);
    if (input.parentName) formData.append("parent_full_name", input.parentName);
    if (input.parentPhone) formData.append("parent_phone", input.parentPhone);
    if (input.parentPassword) formData.append("parent_password", input.parentPassword);
    if (input.documentFile) {
      formData.append("document_file", input.documentFile);
      formData.append("document_type", input.documentType ?? "passport");
    }
    fireAndForget(
      "addStudent",
      studentApi.createWithFiles(formData).then((raw) => {
        const persisted = studentFromRaw(raw as StudentRaw);
        setStudents((prev) => prev.map((s) => (s.id === id ? { ...persisted, parentId } : s)));
      }),
      () => setStudents((prev) => prev.filter((s) => s.id !== id)),
    );
    return created;
  }, []);

  const syncParentChild: DataStoreActions["syncParentChild"] = useCallback(async (studentId) => {
    await parentApi.linkChild(studentId);
    await reload();
  }, [reload]);

  const assignParent: DataStoreActions["assignParent"] = useCallback(async (studentId, parentData) => {
    await studentApi.assignParent(studentId, parentData);
    await reload();
  }, [reload]);

  const updateStudent: DataStoreActions["updateStudent"] = useCallback((id, patch) => {
    const snapshot = students;
    const student = students.find((item) => item.id === id);
    const { password, ...studentPatch } = patch;
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...studentPatch } : s)));
    const resetPassword = password && student?.userId ? authApi.resetPassword(student.userId, password) : Promise.resolve();
    fireAndForget(
      "updateStudent",
      resetPassword.then(() =>
        studentApi.update(id, {
          full_name: studentPatch.fullName,
          phone: studentPatch.phone,
          branch: studentPatch.branchId,
          date_of_birth: studentPatch.birthDate,
          status: studentPatch.status,
        } as never),
      ),
      () => setStudents(snapshot),
    );
  }, [students]);

  const archiveStudent: DataStoreActions["archiveStudent"] = useCallback((id) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, status: "archived" } : s)));
  }, []);

  const deleteStudent: DataStoreActions["deleteStudent"] = useCallback((id, deleteParent) => {
    const snapshot = students;
    const parentSnapshot = parents;
    setStudents((prev) => prev.filter((s) => s.id !== id));
    if (deleteParent) {
      // Find and remove the parent linked to this student
      const student = students.find((s) => s.id === id);
      if (student?.parentId) {
        setParents((prev) => prev.filter((p) => p.id !== student.parentId));
      }
    }
    const url = deleteParent ? `/students/${id}/?delete_parent=true` : `/students/${id}/`;
    fireAndForget(
      "deleteStudent",
      requestJson(url, { method: "DELETE" }),
      () => { setStudents(snapshot); setParents(parentSnapshot); }
    );
  }, [students, parents]);

  const updateStudentPasswords: DataStoreActions["updateStudentPasswords"] = useCallback((id, password, parentPassword) => {
    const payload: any = {};
    if (password) payload.password = password;
    if (parentPassword) payload.parent_password = parentPassword;
    if (Object.keys(payload).length > 0) {
      fireAndForget("updateStudentPasswords", studentApi.update(id, payload as never));
    }
  }, []);

  const addGroup: DataStoreActions["addGroup"] = useCallback((input) => {
    const id = uid("g");
    const created: Group = {
      id,
      name: input.name,
      courseId: input.courseId,
      branchId: input.branchId,
      teacherId: input.teacherId,
      roomId: input.roomId,
      capacity: input.capacity,
      startDate: input.startDate,
      endDate: input.endDate,
      schedule: input.schedule,
      monthlyPrice: input.monthlyPrice,
      status: input.status ?? "recruiting",
      studentIds: [],
    };
    setGroups((prev) => [created, ...prev]);
    fireAndForget(
      "addGroup",
      groupApi.create({
        name: created.name,
        course: created.courseId,
        branch: created.branchId,
        teacher: created.teacherId,
        room: created.roomId || null,
        capacity: created.capacity,
        start_date: created.startDate,
        end_date: created.endDate || null,
        schedule: created.schedule,
        monthly_price: created.monthlyPrice,
        status: created.status,
      } as never).then((raw) => {
        const persisted = groupFromRaw(raw as GroupRaw);
        setGroups((prev) => prev.map((g) => (g.id === id ? persisted : g)));
      }),
      () => setGroups((prev) => prev.filter((g) => g.id !== id)),
    );
    return created;
  }, []);

  const updateGroup: DataStoreActions["updateGroup"] = useCallback((id, patch) => {
    const snapshot = groups;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    fireAndForget(
      "updateGroup",
      groupApi.update(id, {
        name: patch.name,
        course: patch.courseId,
        branch: patch.branchId,
        teacher: patch.teacherId,
        room: patch.roomId || undefined,
        capacity: patch.capacity,
        start_date: patch.startDate,
        end_date: patch.endDate,
        schedule: patch.schedule,
        monthly_price: patch.monthlyPrice,
        status: patch.status,
      } as never),
      () => setGroups(snapshot),
    );
  }, [groups]);

  const deleteGroup: DataStoreActions["deleteGroup"] = useCallback((id) => {
    const snapshot = groups;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    fireAndForget(
      "deleteGroup",
      groupApi.delete(id),
      () => setGroups(snapshot)
    );
  }, [groups]);

  const addStudentToGroup: DataStoreActions["addStudentToGroup"] = useCallback((groupId, studentId) => {
    const prevGroups = groups;
    const prevStudents = students;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.studentIds.includes(studentId)
          ? { ...g, studentIds: [...g.studentIds, studentId] }
          : g,
      ),
    );
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId && !s.groupIds.includes(groupId)
          ? { ...s, groupIds: [...s.groupIds, groupId] }
        : s,
      ),
    );
    fireAndForget("addStudentToGroup", groupApi.addStudent(groupId, studentId), () => {
      setGroups(prevGroups);
      setStudents(prevStudents);
    });
  }, [groups, students]);

  const removeStudentFromGroup: DataStoreActions["removeStudentFromGroup"] = useCallback((groupId, studentId) => {
    const prevGroups = groups;
    const prevStudents = students;
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, studentIds: g.studentIds.filter((x) => x !== studentId) } : g)),
    );
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, groupIds: s.groupIds.filter((x) => x !== groupId) } : s)),
    );
    fireAndForget("removeStudentFromGroup", groupApi.removeStudent(groupId, studentId), () => {
      setGroups(prevGroups);
      setStudents(prevStudents);
    });
  }, [groups, students]);

  const setLessonStatus: DataStoreActions["setLessonStatus"] = useCallback((id, status, cancelReason) => {
    const snapshot = lessons;
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, status, cancelReason } : l)));
    const task = status === "cancelled"
      ? lessonApi.cancel(id, cancelReason ?? "")
      : lessonApi.update(id, { status: status === "completed" ? "conducted" : status } as never);
    fireAndForget("setLessonStatus", task, () => setLessons(snapshot));
  }, [lessons]);

  const rescheduleLesson: DataStoreActions["rescheduleLesson"] = useCallback((id, datetime) => {
    const snapshot = lessons;
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, datetime, status: "rescheduled" } : l)));
    fireAndForget("rescheduleLesson", lessonApi.reschedule(id, datetime), () => setLessons(snapshot));
  }, [lessons]);

  const addCourse: DataStoreActions["addCourse"] = useCallback((input) => {
    const id = uid("c");
    const c: Course = { id, ...input };
    setCourses((prev) => [...prev, c]);
    fireAndForget(
      "addCourse",
      courseApi.create(snake(input as AnyRecord) as never).then((raw) => {
        const persisted = courseFromRaw(raw as CourseRaw);
        setCourses((prev) => prev.map((course) => (course.id === id ? persisted : course)));
      }),
      () => setCourses((prev) => prev.filter((course) => course.id !== id)),
    );
    return c;
  }, []);

  const updateCourse: DataStoreActions["updateCourse"] = useCallback((id, patch) => {
    const snapshot = courses;
    setCourses((prev) => prev.map((course) => (course.id === id ? { ...course, ...patch } : course)));
    fireAndForget(
      "updateCourse",
      courseApi.update(id, snake(patch as AnyRecord) as never).then((raw) => {
        const persisted = courseFromRaw(raw as CourseRaw);
        setCourses((prev) => prev.map((course) => (course.id === id ? persisted : course)));
      }),
      () => setCourses(snapshot),
    );
  }, [courses]);

  const deleteCourse: DataStoreActions["deleteCourse"] = useCallback((id) => {
    const snapshot = courses;
    setCourses((prev) => prev.filter((course) => course.id !== id));
    fireAndForget("deleteCourse", courseApi.delete(id), () => setCourses(snapshot));
  }, [courses]);

  const setAttendance: DataStoreActions["setAttendance"] = useCallback((lessonId, records) => {
    const snapshot = attendance;
    setAttendanceState((prev) => {
      const others = prev.filter((r) => r.lessonId !== lessonId);
      const next = records.map((r) => ({
        id: uid("att"),
        lessonId,
        studentId: r.studentId,
        status: r.status,
        comment: r.comment,
      }));
      return [...others, ...next];
    });
    fireAndForget(
      "setAttendance",
      attendanceApi.bulkMark(
        lessonId,
        records.map((r) => ({
          student_id: r.studentId,
          status: r.status,
          comment: r.comment,
        })),
      ),
      () => setAttendanceState(snapshot),
    );
  }, [attendance]);

  const getAttendanceFor: DataStoreActions["getAttendanceFor"] = useCallback(
    (lessonId) => attendance.filter((r) => r.lessonId === lessonId),
    [attendance],
  );

  const addPayment: DataStoreActions["addPayment"] = useCallback((input) => {
    const id = uid("pay");
    const created: Payment = { id, ...input };
    setPayments((prev) => [created, ...prev]);
    if (input.direction === "in" && input.studentId) {
      setStudents((prev) => prev.map((s) => (s.id === input.studentId ? { ...s, balance: s.balance + input.amount } : s)));
    }
    fireAndForget(
      "addPayment",
      paymentApi.create({
        student_id: created.direction === "in" ? created.studentId : undefined,
        staff_id: created.staffId,
        group_id: created.groupId,
        branch_id: created.branchId,
        amount: created.amount,
        payment_type: created.direction === "out" ? "expense" : "top_up",
        method: created.method,
        category: created.category ?? (created.direction === "out" ? "other" : "tuition"),
        comment: created.comment,
      } as never).then((raw) => {
        const persisted = paymentFromRaw(raw as PaymentRaw);
        setPayments((prev) => prev.map((payment) => (payment.id === id ? { ...persisted, branchId: created.branchId } : payment)));
      }),
      () => setPayments((prev) => prev.filter((payment) => payment.id !== id)),
    );
    return created;
  }, []);

  const reversePayment: DataStoreActions["reversePayment"] = useCallback(async (id) => {
    try {
      const raw = await paymentApi.reverse(id);
      const refund = paymentFromRaw(raw as PaymentRaw);
      setPayments((prev) => [refund, ...prev]);
      
      if (refund.studentId) {
        setStudents((prev) => prev.map((s) => {
          if (s.id === refund.studentId) {
            // 'refund' increases balance (reverses 'charge')
            // 'charge' (reversal of 'top_up') decreases balance
            const delta = refund.type === "refund" ? refund.amount : -refund.amount;
            return { ...s, balance: s.balance + delta };
          }
          return s;
        }));
      }
      toast.success("Transaction reversed");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, []);

  const addPenalty: DataStoreActions["addPenalty"] = useCallback((input) => {
    const id = uid("pen");
    const now = new Date().toISOString();
    const created: StaffPenalty = { id, createdAt: now, updatedAt: now, ...input };
    setPenalties((prev) => [created, ...prev]);
    fireAndForget(
      "addPenalty",
      penaltyApi.create({
        staff: created.staffId,
        branch: created.branchId || null,
        amount: created.amount,
        reason: created.reason,
        penalty_date: created.penaltyDate,
        status: created.status,
        comment: created.comment ?? "",
      } as never).then((raw) => {
        const persisted = penaltyFromRaw(raw as StaffPenaltyRaw);
        setPenalties((prev) => prev.map((penalty) => (penalty.id === id ? persisted : penalty)));
      }),
      () => setPenalties((prev) => prev.filter((penalty) => penalty.id !== id)),
    );
    return created;
  }, []);

  const updatePenalty: DataStoreActions["updatePenalty"] = useCallback((id, patch) => {
    const snapshot = penalties;
    setPenalties((prev) => prev.map((penalty) => (penalty.id === id ? { ...penalty, ...patch } : penalty)));
    fireAndForget(
      "updatePenalty",
      penaltyApi.update(id, {
        staff: patch.staffId,
        branch: patch.branchId ?? undefined,
        amount: patch.amount,
        reason: patch.reason,
        penalty_date: patch.penaltyDate,
        status: patch.status,
        comment: patch.comment,
      } as never).then((raw) => {
        const persisted = penaltyFromRaw(raw as StaffPenaltyRaw);
        setPenalties((prev) => prev.map((penalty) => (penalty.id === id ? persisted : penalty)));
      }),
      () => setPenalties(snapshot),
    );
  }, [penalties]);

  const deletePenalty: DataStoreActions["deletePenalty"] = useCallback((id) => {
    const snapshot = penalties;
    setPenalties((prev) => prev.filter((penalty) => penalty.id !== id));
    fireAndForget("deletePenalty", penaltyApi.delete(id), () => setPenalties(snapshot));
  }, [penalties]);

  const loadThreadMessages: DataStoreActions["loadThreadMessages"] = useCallback((threadId) => {
    fireAndForget(
      "loadThreadMessages",
      chatApi.messages(threadId).then((raw) => {
        const items = toResults(raw as ListResponse<unknown>).map((item) => chatMessageFromRealtime(item, threadId));
        setMessages((prev) => {
          const byId = new Map(prev.map((message) => [message.id, message]));
          for (const item of items) byId.set(item.id, { ...byId.get(item.id), ...item });
          return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      }),
    );
  }, []);


  const startDirectChat: DataStoreActions["startDirectChat"] = useCallback(async (userId, chatType) => {
    try {
      const raw = await chatApi.direct(userId, chatType);
      const [thread] = mapChats([raw]);
      if (!thread?.id) return null;
      setThreads((prev) => {
        const exists = prev.some((item) => item.id === thread.id);
        return exists ? prev.map((item) => (item.id === thread.id ? { ...item, ...thread } : item)) : [thread, ...prev];
      });
      return thread.id;
    } catch (err) {
      toast.error(apiErrorMessage(err));
      return null;
    }
  }, []);

  const sendMessage: DataStoreActions["sendMessage"] = useCallback((threadId, authorId, authorName, text) => {
    const message: ChatMessage = {
      id: uid("msg"),
      threadId,
      authorId,
      authorName,
      text,
      createdAt: new Date().toISOString(),
      read: true,
    };
    setMessages((prev) => [...prev, message]);
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, lastMessageAt: message.createdAt } : t)),
    );
    fireAndForget(
      "sendMessage",
      chatApi.send(threadId, text).then((raw) => {
        const payload = ((raw as AnyRecord).payload as AnyRecord | undefined) ?? (raw as AnyRecord);
        const persisted: ChatMessage = {
          id: String(payload.id ?? message.id),
          threadId,
          authorId,
          authorName,
          text: String(payload.text ?? text),
          createdAt: String(payload.created_at ?? message.createdAt),
          read: true,
        };
        setMessages((prev) => prev.map((m) => (m.id === message.id ? persisted : m)));
      }),
      () => setMessages((prev) => prev.filter((m) => m.id !== message.id)),
    );
  }, []);

  const receiveChatMessage: DataStoreActions["receiveChatMessage"] = useCallback((threadId, payload) => {
    const incoming = chatMessageFromRealtime(payload, threadId);
    setMessages((prev) => {
      if (prev.some((message) => message.id === incoming.id)) {
        return prev.map((message) => (message.id === incoming.id ? { ...message, ...incoming } : message));
      }
      const optimisticIndex = prev.findIndex((message) => isSameOptimisticMessage(message, incoming));
      if (optimisticIndex >= 0) {
        return prev.map((message, index) => (index === optimisticIndex ? { ...incoming, read: true } : message));
      }
      return [...prev, incoming];
    });
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === incoming.threadId
          ? {
              ...thread,
              lastMessageAt: incoming.createdAt,
              unread: incoming.authorId && incoming.authorId !== user?.id ? thread.unread + 1 : thread.unread,
            }
          : thread,
      ),
    );
  }, [user?.id]);

  const markThreadRead: DataStoreActions["markThreadRead"] = useCallback((threadId) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));
    setMessages((prev) => prev.map((m) => (m.threadId === threadId ? { ...m, read: true } : m)));
    fireAndForget("markThreadRead", chatApi.markRead(threadId));
  }, []);


  const updateParentPassword: DataStoreActions["updateParentPassword"] = useCallback((parentId, password) => {
    const snapshot = parents;
    const parent = parents.find((item) => item.id === parentId);
    if (!parent?.userId) {
      toast.error("Parent user is not available");
      return;
    }
    fireAndForget(
      "updateParentPassword",
      authApi.resetPassword(parent.userId, password),
      () => setParents(snapshot),
    );
  }, [parents]);

  const markNotificationRead: DataStoreActions["markNotificationRead"] = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    fireAndForget("markNotificationRead", notificationApi.markRead(id));
  }, []);

  const markAllNotificationsRead: DataStoreActions["markAllNotificationsRead"] = useCallback((audience) => {
    setNotifications((prev) =>
      prev.map((n) => (n.audience.includes(audience) ? { ...n, read: true } : n)),
    );
    fireAndForget("markAllNotificationsRead", notificationApi.markAllRead());
  }, []);

  const addHomework: DataStoreActions["addHomework"] = useCallback((input) => {
    const created: Homework = {
      id: uid("hw"),
      assignedAt: new Date().toISOString(),
      ...input,
    };
    setHomework((prev) => [created, ...prev]);
    // Auto-create pending submissions for every student in the group
    setGroups((prevGroups) => {
      const grp = prevGroups.find((g) => g.id === input.groupId);
      if (grp) {
        const newSubs: HomeworkSubmission[] = grp.studentIds.map((sid) => ({
          id: uid("sub"),
          homeworkId: created.id,
          studentId: sid,
          status: "pending" as HomeworkSubmissionStatus,
        }));
        setSubmissions((prev) => [...prev, ...newSubs]);
      }
      return prevGroups;
    });
    fireAndForget(
      "addHomework",
      homeworkApi.create({
        title: created.title,
        description: created.description,
        assign_type: "group",
        group: created.groupId,
        deadline: created.dueDate,
      } as never).then((raw) => {
        const persisted = homeworkFromRaw(raw as HomeworkRaw);
        setHomework((prev) => prev.map((h) => (h.id === created.id ? persisted : h)));
      }),
      () => setHomework((prev) => prev.filter((h) => h.id !== created.id)),
    );
    return created;
  }, []);

  const updateSubmission: DataStoreActions["updateSubmission"] = useCallback(
    (homeworkId, studentId, patch) => {
      const snapshot = submissions;
      const existing = submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
      setSubmissions((prev) => {
        if (existing) {
          return prev.map((s) =>
            s.homeworkId === homeworkId && s.studentId === studentId ? { ...s, ...patch } : s,
          );
        }
        const created: HomeworkSubmission = {
          id: uid("sub"),
          homeworkId,
          studentId,
          status: "pending",
          ...patch,
        };
        return [...prev, created];
      });
      if (existing) {
        fireAndForget(
          "updateSubmission",
          homeworkApi.gradeSubmission(existing.id, submissionPatchToApi(patch)),
          () => setSubmissions(snapshot),
        );
      }
    },
    [submissions],
  );

  const gradeSubmission: DataStoreActions["gradeSubmission"] = useCallback(
    (homeworkId, studentId, grade, feedback) => {
      const hw = homework.find((h) => h.id === homeworkId);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.homeworkId === homeworkId && s.studentId === studentId
            ? { ...s, grade, feedback, status: "graded" as HomeworkSubmissionStatus }
            : s,
        ),
      );
      // Mirror as a Grade entry of kind "homework"
      if (hw) {
        setGrades((prev) => {
          const existing = prev.find(
            (g) => g.studentId === studentId && g.title === hw.title && g.kind === "homework",
          );
          if (existing) {
            return prev.map((g) => (g.id === existing.id ? { ...g, score: grade, comment: feedback } : g));
          }
          const created: Grade = {
            id: uid("gr"),
            groupId: hw.groupId,
            teacherId: hw.teacherId,
            studentId,
            kind: "homework",
            title: hw.title,
            score: grade,
            maxScore: 10,
            date: new Date().toISOString().slice(0, 10),
            comment: feedback,
          };
          return [created, ...prev];
        });
      }
      const existing = submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
      if (existing) {
        fireAndForget(
          "gradeSubmission",
          homeworkApi.gradeSubmission(
            existing.id,
            submissionPatchToApi({ grade, feedback, status: "graded" }),
          ),
        );
      }
    },
    [homework, submissions],
  );

  const addGrade: DataStoreActions["addGrade"] = useCallback((input) => {
    const created: Grade = { id: uid("gr"), ...input };
    setGrades((prev) => [created, ...prev]);
    fireAndForget(
      "addGrade",
      gradeApi.create({
        student: created.studentId,
        group: created.groupId,
        grade_type: created.kind,
        score: created.score,
        comment: created.comment,
      } as never).then((raw) => {
        const persisted = gradeFromRaw(raw as GradeRaw);
        setGrades((prev) => prev.map((grade) => (grade.id === created.id ? persisted : grade)));
      }),
      () => setGrades((prev) => prev.filter((grade) => grade.id !== created.id)),
    );
    return created;
  }, []);

  const updateGrade: DataStoreActions["updateGrade"] = useCallback((id, patch) => {
    const snapshot = grades;
    setGrades((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    fireAndForget(
      "updateGrade",
      gradeApi.update(id, {
        grade_type: patch.kind,
        score: patch.score,
        comment: patch.comment,
      } as never),
      () => setGrades(snapshot),
    );
  }, [grades]);

  const deleteGrade: DataStoreActions["deleteGrade"] = useCallback((id) => {
    const snapshot = grades;
    setGrades((prev) => prev.filter((g) => g.id !== id));
    fireAndForget("deleteGrade", gradeApi.delete(id), () => setGrades(snapshot));
  }, [grades]);

  // ---------------- Institutions ----------------
  const addInstitution: DataStoreActions["addInstitution"] = useCallback((input) => {
    const id = uid("i");
    let directorId = input.directorId;
    let directorName = input.directorName;
    let directorPhone = input.directorPhone;
    if (directorName && directorPhone && !directorId) {
      const sid = uid("s");
      const newDirector: Staff = {
        id: sid,
        fullName: directorName,
        phone: directorPhone,
        role: "director",
      };
      setStaff((prev) => [...prev, newDirector]);
      directorId = sid;
    }
    const created: Institution = {
      id,
      name: input.name,
      slug: input.slug,
      schemaName: input.slug,
      domain: input.domain,
      city: input.city,
      plan: input.plan,
      status: input.status,
      expiresAt: input.expiresAt,
      studentsCount: input.studentsCount ?? 0,
      branchesCount: input.branchesCount ?? 0,
      staffCount: input.staffCount ?? (directorId ? 1 : 0),
      monthlyRevenue: input.monthlyRevenue ?? 0,
      createdAt: new Date().toISOString().slice(0, 10),
      directorId,
      directorName,
      directorPhone,
      directorPassword: input.directorPassword,
    };
    setInstitutions((prev) => [created, ...prev]);
    fireAndForget(
      "addInstitution",
      superadminApi.institutions.create({
        name: created.name,
        slug: created.slug,
        domain: created.domain,
        address: created.city,
        subscription_end: created.expiresAt,
        director_full_name: created.directorName,
        director_phone: created.directorPhone,
        director_password: created.directorPassword,
      } as never).then((raw) => {
        const persisted = institutionFromRaw(raw as InstitutionRaw);
        setInstitutions((prev) => prev.map((i) => (i.id === id ? { ...created, ...persisted } : i)));
        setBranches((prev) =>
          prev.map((branch) =>
            branch.institutionId === id ? { ...branch, institutionId: persisted.id } : branch,
          ),
        );
      }),
      () => setInstitutions((prev) => prev.filter((i) => i.id !== id)),
    );
    return created;
  }, []);

  const updateInstitution: DataStoreActions["updateInstitution"] = useCallback((id, patch) => {
    const snapshot = institutions;
    setInstitutions((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    fireAndForget("updateInstitution", superadminApi.institutions.update(id, snake(patch as AnyRecord) as never), () => setInstitutions(snapshot));
  }, [institutions]);

  const deleteInstitution: DataStoreActions["deleteInstitution"] = useCallback((id) => {
    const snapshot = institutions;
    setInstitutions((prev) => prev.filter((i) => i.id !== id));
    setBranches((prev) => prev.filter((b) => b.institutionId !== id));
    fireAndForget("deleteInstitution", superadminApi.institutions.delete(id), () => setInstitutions(snapshot));
  }, [institutions]);

  // ---------------- Branches ----------------
  const addBranch: DataStoreActions["addBranch"] = useCallback((input) => {
    const created: Branch = { id: uid("b"), ...input };
    setBranches((prev) => [...prev, created]);
    if (input.institutionId) {
      setInstitutions((prev) =>
        prev.map((i) => (i.id === input.institutionId ? { ...i, branchesCount: i.branchesCount + 1 } : i)),
      );
      }
      fireAndForget(
        "addBranch",
        (
          user?.role === "superadmin" && input.institutionId
            ? superadminApi.branches.create(input.institutionId, snake(input as AnyRecord) as never)
            : branchApi.create(snake(input as AnyRecord) as never)
        ).then((raw) => {
          const persisted = branchFromRaw(raw as BranchRaw);
          setBranches((prev) => prev.map((b) => (b.id === created.id ? { ...created, ...persisted } : b)));
        }),
        () => setBranches((prev) => prev.filter((b) => b.id !== created.id)),
      );
      return created;
    }, [user?.role]);

  const updateBranch: DataStoreActions["updateBranch"] = useCallback((id, patch) => {
    const snapshot = branches;
    const target = branches.find((branch) => branch.id === id);
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    fireAndForget(
      "updateBranch",
      user?.role === "superadmin" && target?.institutionId
        ? superadminApi.branches.update(target.institutionId, id, snake(patch as AnyRecord) as never)
        : branchApi.update(id, snake(patch as AnyRecord) as never),
      () => setBranches(snapshot),
    );
  }, [branches, user?.role]);

  const deleteBranch: DataStoreActions["deleteBranch"] = useCallback((id) => {
    const snapshot = branches;
    const target = branches.find((b) => b.id === id);
    setBranches((prev) => {
      if (target?.institutionId) {
        setInstitutions((insts) =>
          insts.map((i) => (i.id === target.institutionId ? { ...i, branchesCount: Math.max(0, i.branchesCount - 1) } : i)),
        );
      }
      return prev.filter((b) => b.id !== id);
    });
    fireAndForget(
      "deleteBranch",
      user?.role === "superadmin" && target?.institutionId
        ? superadminApi.branches.delete(target.institutionId, id)
        : branchApi.delete(id),
      () => setBranches(snapshot),
    );
  }, [branches, user?.role]);

  // ---------------- Rooms ----------------
  const addRoom: DataStoreActions["addRoom"] = useCallback((input) => {
    const created: Room = { id: uid("r"), ...input };
    setRooms((prev) => [...prev, created]);
    fireAndForget(
      "addRoom",
      roomApi.create({
        name: input.name,
        branch: input.branchId,
        capacity: input.capacity,
      } as never).then((raw) => {
        const persisted = roomFromRaw(raw as RoomRaw);
        setRooms((prev) => prev.map((room) => (room.id === created.id ? persisted : room)));
      }),
      () => setRooms((prev) => prev.filter((room) => room.id !== created.id)),
    );
    return created;
  }, []);

  const updateRoom: DataStoreActions["updateRoom"] = useCallback((id, patch) => {
    const snapshot = rooms;
    setRooms((prev) => prev.map((room) => (room.id === id ? { ...room, ...patch } : room)));
    fireAndForget(
      "updateRoom",
      roomApi.update(id, {
        name: patch.name,
        branch: patch.branchId,
        capacity: patch.capacity,
      } as never),
      () => setRooms(snapshot),
    );
  }, [rooms]);

  const deleteRoom: DataStoreActions["deleteRoom"] = useCallback((id) => {
    const snapshot = rooms;
    setRooms((prev) => prev.filter((room) => room.id !== id));
    fireAndForget("deleteRoom", roomApi.delete(id), () => setRooms(snapshot));
  }, [rooms]);

  // ---------------- Staff ----------------
  const addStaff: DataStoreActions["addStaff"] = useCallback((input) => {
    const created: Staff = { id: uid("s"), ...input };
    setStaff((prev) => [...prev, created]);
    fireAndForget(
      "addStaff",
      staffApi.create({
        full_name: input.fullName,
        phone: input.phone,
        password: input.password,
        role: input.role,
        branch: input.branchId,
        salary_percent: input.salaryPercent ?? null,
        fixed_salary: input.fixedSalary ?? null,
      } as never).then((raw) => {
        const persisted = staffFromRaw(raw as StaffRaw);
        setStaff((prev) => prev.map((s) => (s.id === created.id ? persisted : s)));
      }),
      () => setStaff((prev) => prev.filter((s) => s.id !== created.id)),
    );
    return created;
  }, []);

  const updateStaff: DataStoreActions["updateStaff"] = useCallback((id, patch) => {
    const snapshot = staff;
    const staffMember = staff.find((item) => item.id === id);
    const { password, ...staffPatch } = patch;
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...staffPatch } : s)));
    const resetPassword = password && staffMember?.userId ? authApi.resetPassword(staffMember.userId, password) : Promise.resolve();
    fireAndForget(
      "updateStaff",
      resetPassword.then(() =>
        staffApi.update(id, {
          full_name: staffPatch.fullName,
          phone: staffPatch.phone,
          role: staffPatch.role,
          branch: staffPatch.branchId,
          salary_percent: staffPatch.salaryPercent ?? null,
          fixed_salary: staffPatch.fixedSalary ?? null,
        } as never),
      ),
      () => setStaff(snapshot),
    );
  }, [staff]);

  const deleteStaff: DataStoreActions["deleteStaff"] = useCallback((id) => {
    const snapshot = staff;
    setStaff((prev) => prev.filter((s) => s.id !== id));
    fireAndForget("deleteStaff", staffApi.delete(id), () => setStaff(snapshot));
  }, [staff]);

  const value = useMemo<DataStoreValue>(
    () => ({
      branches,
      rooms,
      courses,
      staff,
      parents,
      students,
      groups,
      lessons,
      attendance,
      payments,
      penalties,

      threads,
      messages,
      notifications,
      homework,
      submissions,
      grades,
      auditLog,
      institutions,
      isLoading,
      loadError,
      reload,
      addStudent,
      updateStudent,
      archiveStudent,
      deleteStudent,
      syncParentChild,
      assignParent,
      updateStudentPasswords,
      addGroup,
      updateGroup,
      deleteGroup,
      addStudentToGroup,
      removeStudentFromGroup,
      setLessonStatus,
      rescheduleLesson,
      addCourse,
      updateCourse,
      deleteCourse,
      setAttendance,
      getAttendanceFor,
      addPayment,
      reversePayment,
      addPenalty,
      updatePenalty,
      deletePenalty,
 
      loadThreadMessages,
      startDirectChat,
      sendMessage,
      receiveChatMessage,
      markThreadRead,
      updateParentPassword,
      markNotificationRead,
      markAllNotificationsRead,
      addHomework,
      updateSubmission,
      gradeSubmission,
      addGrade,
      updateGrade,
      deleteGrade,
      addInstitution,
      updateInstitution,
      deleteInstitution,
      addBranch,
      updateBranch,
      deleteBranch,
      addRoom,
      updateRoom,
      deleteRoom,
      addStaff,
      updateStaff,
      deleteStaff,
    }),
    [branches, rooms, courses, staff, parents, students, groups, lessons, attendance, payments, penalties, threads, messages, notifications, homework, submissions, grades, auditLog, institutions, isLoading, loadError, reload, addStudent, updateStudent, archiveStudent, deleteStudent, syncParentChild, assignParent, updateStudentPasswords, addGroup, updateGroup, deleteGroup, addStudentToGroup, removeStudentFromGroup, setLessonStatus, rescheduleLesson, addCourse, updateCourse, deleteCourse, setAttendance, getAttendanceFor, addPayment, addPenalty, updatePenalty, deletePenalty, loadThreadMessages, startDirectChat, sendMessage, receiveChatMessage, markThreadRead, updateParentPassword, markNotificationRead, markAllNotificationsRead, addHomework, updateSubmission, gradeSubmission, addGrade, updateGrade, deleteGrade, addInstitution, updateInstitution, deleteInstitution, addBranch, updateBranch, deleteBranch, addRoom, updateRoom, deleteRoom, addStaff, updateStaff, deleteStaff],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataStoreProvider");
  return ctx;
}
