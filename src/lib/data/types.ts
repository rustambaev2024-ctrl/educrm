// Domain types for EduCRM frontend (V1).
// Backend (Django) is the source of truth — these types must mirror DRF serializers.

export type StudentStatus =
  | "active"
  | "frozen"
  | "debtor"
  | "archived"
  | "graduate"
  | "expelled";

export type GroupStatus = "recruiting" | "active" | "frozen" | "completed";

export type LessonStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";

export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "online";

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Mon ... 7=Sun

export interface ScheduleSlot {
  day: DayOfWeek;
  start: string; // "HH:MM"
  end: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  institutionId?: string;
}

export interface Room {
  id: string;
  name: string;
  branchId: string;
  capacity: number;
}

export interface Course {
  id: string;
  name: string;
  description?: string;
}

export interface Staff {
  id: string;
  userId?: string;
  fullName: string;
  phone: string;
  password?: string;
  role: "director" | "admin" | "teacher";
  branchId?: string;
}

export interface Parent {
  id: string;
  fullName: string;
  phone: string;
  password?: string;
  userId?: string;
  childrenIds: string[];
}

export interface Student {
  id: string;
  userId?: string;
  fullName: string;
  phone: string;
  password?: string;
  birthDate?: string; // ISO
  photo?: string;
  branchId: string;
  status: StudentStatus;
  registeredAt: string;
  balance: number;
  groupIds: string[];
  parentId?: string;
  documents?: { id: string; name: string; uploadedAt: string }[];
  certificates?: { id: string; courseName: string; date: string }[];
}

export interface Group {
  id: string;
  name: string;
  courseId: string;
  branchId: string;
  teacherId: string;
  roomId: string;
  capacity: number;
  startDate: string;
  endDate?: string;
  schedule: ScheduleSlot[];
  monthlyPrice: number;
  status: GroupStatus;
  studentIds: string[];
}

export interface Lesson {
  id: string;
  groupId: string;
  datetime: string; // ISO
  durationMinutes: number;
  roomId: string;
  topic?: string;
  status: LessonStatus;
  cancelReason?: string;
  isSubstitution?: boolean;
  substituteTeacherId?: string;
}

export interface AttendanceRecord {
  id: string;
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  comment?: string;
}

export type PaymentMethod = "cash" | "card" | "transfer" | "click" | "payme";
export type PaymentDirection = "in" | "out";

export interface Payment {
  id: string;
  studentId?: string;       // for incoming tuition payments
  staffId?: string;         // for salary outgoing
  groupId?: string;
  branchId: string;
  amount: number;           // positive value
  direction: PaymentDirection;
  method: PaymentMethod;
  date: string;             // ISO
  comment?: string;
  category?: "tuition" | "salary" | "rent" | "utilities" | "marketing" | "other";
}

export type InvoiceStatus = "pending" | "paid" | "partial" | "overdue";

export interface Invoice {
  id: string;
  studentId: string;
  groupId: string;
  period: string;           // "YYYY-MM"
  amount: number;
  paidAmount: number;
  dueDate: string;          // ISO
  status: InvoiceStatus;
}

export type ChatScope = "direct" | "group" | "broadcast";

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  text: string;
  createdAt: string;
  read: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;             // contact display name or group name
  scope: ChatScope;
  participantIds: string[];  // user ids
  groupId?: string;          // when scope=group
  lastMessageAt: string;
  lastMessage?: string;
  unread: number;
  avatar?: string;
}

export type NotificationKind =
  | "payment"
  | "lesson"
  | "homework"
  | "system"
  | "message"
  | "attendance"
  | "debtor";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
  audience: ("superadmin" | "director" | "admin" | "teacher" | "student" | "parent")[];
}

// Homework
export type HomeworkSubmissionStatus = "pending" | "submitted" | "graded" | "late";

export interface HomeworkAttachment {
  id: string;
  name: string;
  url?: string;
}

export interface Homework {
  id: string;
  groupId: string;
  teacherId: string;
  title: string;
  description: string;
  assignedAt: string; // ISO
  dueDate: string;    // ISO date
  attachments?: HomeworkAttachment[];
}

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  status: HomeworkSubmissionStatus;
  submittedAt?: string;
  comment?: string;
  grade?: number;     // 0..100
  feedback?: string;
  attachments?: HomeworkAttachment[];
}

// Grades / exams
export type GradeKind = "homework" | "quiz" | "exam" | "midterm" | "final" | "oral";

export interface Grade {
  id: string;
  groupId: string;
  studentId: string;
  teacherId: string;
  kind: GradeKind;
  title: string;       // e.g. "Unit 4 Quiz", "Midterm"
  score: number;       // 0..100
  maxScore: number;    // usually 100
  date: string;        // ISO date
  comment?: string;
}

// Audit log
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "login"
  | "payment"
  | "cancel"
  | "reschedule";

export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: "superadmin" | "director" | "admin" | "teacher" | "student" | "parent";
  action: AuditAction;
  entity: string;        // e.g. "student", "group", "lesson", "payment"
  entityId?: string;
  summary: string;       // human-readable short text
  branchId?: string;
  createdAt: string;     // ISO
}

// Institution (superadmin level)
export type InstitutionPlan = "basic" | "standard" | "pro";
export type InstitutionStatus = "active" | "frozen" | "archived";

export interface Institution {
  id: string;
  name: string;
  slug?: string;
  schemaName?: string;
  domain?: string;
  city: string;
  studentsCount: number;
  branchesCount: number;
  staffCount: number;
  plan: InstitutionPlan;
  status: InstitutionStatus;
  monthlyRevenue: number;  // UZS
  expiresAt: string;       // ISO date
  createdAt: string;       // ISO date
  directorId?: string;
  directorName?: string;
  directorPhone?: string;
  directorPassword?: string;
}
