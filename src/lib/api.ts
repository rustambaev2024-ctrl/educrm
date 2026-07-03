const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!RAW_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required");
}

export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

export const TENANT_SCHEMA_KEY = "educrm.tenant_schema";
export const AUTH_KEY = "educrm.auth";

export type UserRole = "superadmin" | "director" | "admin" | "branch_admin" | "teacher" | "support_teacher" | "student" | "parent";

export interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole;
  photo?: string | null;
  language?: string;
  theme?: string;
  schemaName?: string;
  profileId?: string;
  teacherId?: string;
  studentId?: string;
  parentId?: string;
  institutionId?: string;
  branchId?: string;
}

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: AuthUser;
  schemaName?: string;
}

export interface RefreshResponse {
  access: string;
}

type PersistedAuthShape = {
  access?: string;
  refresh?: string;
  tokens?: {
    access?: string;
    refresh?: string;
  };
  user?: AuthUser | null;
};

type ApiList<T> = { results: T[]; count: number } | T[];

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getTenantSchema(): string {
  if (typeof window === "undefined") return import.meta.env.VITE_DEFAULT_TENANT_SCHEMA ?? "";
  const stored = localStorage.getItem(TENANT_SCHEMA_KEY);
  // Fallback на дефолтную schema (single-tenant прод) — работает и в DEV, и в PROD.
  // Нужно для публичных страниц (/join, /apply) где пользователь не залогинен.
  return stored ?? import.meta.env.VITE_DEFAULT_TENANT_SCHEMA ?? "";
}

export function setTenantSchema(schema: string | null) {
  if (typeof window === "undefined") return;
  if (schema) localStorage.setItem(TENANT_SCHEMA_KEY, schema);
  else localStorage.removeItem(TENANT_SCHEMA_KEY);
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits.startsWith("998") ? `+${digits}` : digits;
}

function readPersistedAuth(): PersistedAuthShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAuthShape;
  } catch {
    return null;
  }
}

export function readAccessToken(): string | null {
  const auth = readPersistedAuth();
  return auth?.access ?? auth?.tokens?.access ?? null;
}

export function readRefreshToken(): string | null {
  const auth = readPersistedAuth();
  return auth?.refresh ?? auth?.tokens?.refresh ?? null;
}

export function saveTokens(access: string, refresh: string) {
  if (typeof window === "undefined") return;
  const current = readPersistedAuth() ?? {};
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      ...current,
      access,
      refresh,
      tokens: { access, refresh },
    }),
  );
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function doRefresh(): Promise<string | null> {
  const refresh = readRefreshToken();
  if (!refresh) return null;

  const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Schema": getTenantSchema(),
    },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as RefreshResponse;
  if (data.access) saveTokens(data.access, refresh);
  return data.access ?? null;
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Schema": getTenantSchema(),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const access = readAccessToken();
  if (access) headers.Authorization = `Bearer ${access}`;

  const makeRequest = (token: string | null) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    }).then(
      (res) => { clearTimeout(timeoutId); return res; },
      (e) => {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("Request timed out — server took too long to respond");
        }
        throw e;
      },
    );
  };

  let res = await makeRequest(access);

  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await doRefresh();
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(newToken ?? ""));
      refreshQueue = [];

      if (!newToken) {
        if (typeof window !== "undefined") {
          localStorage.removeItem(AUTH_KEY);
          window.location.href = "/";
        }
        throw new Error("Session expired");
      }

      res = await makeRequest(newToken);
    } else {
      const newToken = await new Promise<string>((resolve) => refreshQueue.push(resolve));
      res = await makeRequest(newToken);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body as Record<string, unknown>);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export async function requestForm<T>(path: string, formData: FormData, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "X-Tenant-Schema": getTenantSchema(),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const access = readAccessToken();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init.method ?? "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body as Record<string, unknown>);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(`API ${status}`);
  }
}

// ─── Generic CRUD factory ─────────────────────────────────────────────────────

export function crudApi<T, C = Partial<T>, U = Partial<T>>(base: string) {
  return {
    list: (params?: Record<string, string | number | boolean>) => {
      const qs = params
        ? `?${new URLSearchParams(
            Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
          )}`
        : "";
      return requestJson<ApiList<T>>(`${base}${qs}`);
    },
    get: (id: string) => requestJson<T>(`${base}${id}/`),
    create: (data: C) =>
      requestJson<T>(base, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: U) =>
      requestJson<T>(`${base}${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) => requestJson<void>(`${base}${id}/`, { method: "DELETE" }),
  };
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: (phoneOrBody: string | LoginRequest, password?: string) => {
    const body =
      typeof phoneOrBody === "string"
        ? { phone: normalizePhone(phoneOrBody), password: password?.trim() }
        : { ...phoneOrBody, phone: normalizePhone(phoneOrBody.phone), password: phoneOrBody.password.trim() };

    // Send X-Tenant-Schema so the backend can resolve the correct tenant.
    // If no tenant is stored (first visit), send "public" to trigger superadmin
    // lookup or prompt the user to select an institution first.
    const schema = getTenantSchema() || "public";
    return fetch(`${API_BASE_URL}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Schema": schema },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new ApiError(res.status, errorBody);
      }
      return res.json() as Promise<LoginResponse>;
    });
  },

  me: () => requestJson<AuthUser>("/auth/me/"),

  updateMe: (data: Partial<AuthUser> | { phone?: string }) =>
    requestJson<AuthUser>("/auth/me/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),


  refresh: (refresh: string) =>
    requestJson<RefreshResponse>("/auth/refresh/", {
      method: "POST",
      body: JSON.stringify({ refresh }),
    }),

  logout: (refresh: string) =>
    requestJson<void>("/auth/logout/", {
      method: "POST",
      body: JSON.stringify({ refresh }),
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    requestJson<void>("/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    }),

  resetPassword: (userId: string, newPassword: string) =>
    requestJson<void>("/auth/reset-password/", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, new_password: newPassword }),
    }),
};

// ─── Business API clients ─────────────────────────────────────────────────────

export const branchApi = {
  ...crudApi("/branches/"),
  deleteForce: (id: string) => requestJson<void>(`/branches/${id}/?force=true`, { method: "DELETE" }),
  metaSettings: () => requestJson<{ meta_pixel_id: string; meta_access_token: string }>("/branches/meta-settings/"),
  updateMetaSettings: (data: { meta_pixel_id?: string; meta_access_token?: string }) =>
    requestJson("/branches/meta-settings/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  smsSettings: () =>
    requestJson<{ sms_enabled: boolean; sms_email: string; sms_password: string; sms_sender: string }>(
      "/branches/sms-settings/",
    ),
  updateSmsSettings: (data: Record<string, unknown>) =>
    requestJson("/branches/sms-settings/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  testSms: (phone: string) =>
    requestJson("/branches/sms-test/", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  institutionSettings: () => requestJson<{ name: string; address: string; phone: string; logo: string | null }>("/branches/settings/"),
  updateInstitutionSettings: (data: FormData | Record<string, any>) => {
    if (data instanceof FormData) {
      return requestForm("/branches/settings/", data, { method: "PATCH" });
    }
    return requestJson("/branches/settings/", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};
export const roomApi = crudApi("/rooms/");

export const staffApi = {
  ...crudApi("/staff/"),
  salary: (staffId: string, params: { period_start: string; period_end: string; percent: number }) =>
    requestJson(`/staff/${staffId}/salary/`, {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

export const supportTeacherApi = {
  links: {
    list: () => requestJson<unknown[]>("/staff/support-teacher-links/"),
    create: (data: Record<string, unknown>) =>
      requestJson("/staff/support-teacher-links/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      requestJson(`/staff/support-teacher-links/${id}/`, { method: "DELETE" }),
  },
};

export const penaltyApi = crudApi("/penalties/");
export const bonusApi = crudApi("/staff/bonuses/");

export const courseApi = crudApi("/courses/");

export const groupApi = {
  ...crudApi("/groups/"),
  students: (groupId: string) => requestJson<unknown[]>(`/groups/${groupId}/students/`),
  addStudent: (groupId: string, studentId: string) =>
    requestJson(`/groups/${groupId}/students/`, {
      method: "POST",
      body: JSON.stringify({ student_id: studentId }),
    }),
  removeStudent: (groupId: string, studentId: string) =>
    requestJson(`/groups/${groupId}/students/${studentId}/`, {
      method: "DELETE",
    }),
  deleteForce: (id: string) =>
    requestJson<void>(`/groups/${id}/?force=true`, { method: "DELETE" }),
};

export const studentApi = {
  ...crudApi("/students/"),
  createWithFiles: (data: FormData) => requestForm("/students/", data),
  assignParent: (studentId: string, parentData: {
    parentId?: string;
    parentName?: string;
    parentPhone?: string;
    parentPassword?: string;
  }) =>
    requestJson<unknown>(`/students/${studentId}/assign-parent/`, {
      method: "POST",
      body: JSON.stringify({
        parent_id: parentData.parentId,
        parent_name: parentData.parentName,
        parent_phone: parentData.parentPhone,
        parent_password: parentData.parentPassword,
      }),
    }),
  generateLinkCode: (studentId: string) =>
    requestJson<{ code: string; expires_at: string; student_name: string }>(
      `/students/${studentId}/generate-link-code/`,
      { method: "POST" },
    ),
  closedMemberships: (studentId: string) =>
    requestJson<{
      groups: {
        group_id: string;
        group_name: string;
        group_status: string;
        current_count: number;
        capacity: number | null;
      }[];
      closed_at?: string;
    }>(`/students/${studentId}/closed-memberships/`),
  updateStatus: (id: string, status: string) =>
    requestJson(`/students/${id}/`, { method: "PATCH", body: JSON.stringify({ status }) }),
  me: () => requestJson("/student/me/"),
  mySchedule: () => requestJson("/student/me/schedule/"),
  myAttendance: () => requestJson("/student/me/attendance/"),
  myGrades: () => requestJson("/student/me/grades/"),
  myHomeworks: () => requestJson("/student/me/homeworks/"),
  myWallet: () => requestJson("/student/me/wallet/"),
};

export const leadApi = {
  ...crudApi("/leads/"),
  convert: (id: string, payload?: Record<string, any>) =>
    requestJson(`/leads/${id}/convert/`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
};

export const parentApi = {
  list: () => requestJson("/parents/"),
  me: () => requestJson("/parent/me/"),
  children: () => requestJson("/parent/me/children/"),
  linkChild: (code: string) =>
    requestJson("/parent/me/children/link/", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

export const lessonApi = {
  ...crudApi("/lessons/"),
  cancel: (id: string, reason: string) =>
    requestJson(`/lessons/${id}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  reschedule: (id: string, datetime: string) =>
    requestJson(`/lessons/${id}/reschedule/`, {
      method: "POST",
      body: JSON.stringify({ datetime }),
    }),
  teacherCheckin: {
    get: (lessonId: string) => requestJson<any>(`/lessons/${lessonId}/teacher-checkin/`),
    set: (lessonId: string, data: any) =>
      requestJson<any>(`/lessons/${lessonId}/teacher-checkin/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};

export const attendanceApi = {
  list: () => requestJson("/attendance/"),
  forLesson: (lessonId: string) => requestJson(`/lessons/${lessonId}/attendance/`),
  bulkMark: (lessonId: string, records: unknown[]) =>
    requestJson(`/lessons/${lessonId}/attendance/`, {
      method: "POST",
      body: JSON.stringify({ records }),
    }),
  update: (id: string, data: unknown) =>
    requestJson(`/attendance/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const paymentApi = {
  ...crudApi("/payments/"),
  topUp: (studentId: string, data: unknown) =>
    requestJson("/payments/", {
      method: "POST",
      body: JSON.stringify({ student: studentId, transaction_type: "top_up", ...(data as any) }),
    }),
  debtors: (branchId?: string) => requestJson(`/payments/debtors/${branchId ? `?branch=${branchId}` : ""}`),
  reverse: (id: string) =>
    requestJson(`/payments/${id}/reverse/`, {
      method: "POST",
    }),
};

export const homeworkApi = {
  ...crudApi("/homeworks/"),
  allSubmissions: () => requestJson("/homeworks/submissions/"),
  submissions: (homeworkId: string) => requestJson(`/homeworks/${homeworkId}/statuses/`),
  gradeSubmission: (submissionId: string, data: unknown) =>
    requestJson(`/homeworks/submissions/${submissionId}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const gradeApi = crudApi("/grades/");

export const chatApi = {
  list: () => requestJson("/chats/"),
  direct: (userId: string, chatType?: string) =>
    requestJson("/chats/direct/", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, chat_type: chatType }),
    }),
  messages: (chatId: string, page = 1) => requestJson(`/chats/${chatId}/messages/?page=${page}`),
  send: (chatId: string, content: string, replyTo?: string) =>
    requestJson(`/chats/${chatId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ text: content, reply_to: replyTo }),
    }),
  markRead: (chatId: string) => requestJson(`/chats/${chatId}/mark-read/`, { method: "POST" }),
};

export const notificationApi = {
  list: () => requestJson("/notifications/"),
  markRead: (id: string) => requestJson(`/notifications/${id}/read/`, { method: "PATCH" }),
  markAllRead: () => requestJson("/notifications/read-all/", { method: "PATCH" }),
};

export const analyticsApi = {
  overview: (params?: Record<string, string>) =>
    requestJson(`/analytics/overview/${params ? `?${new URLSearchParams(params)}` : ""}`),
  attendance: (params?: Record<string, string>) =>
    requestJson(`/analytics/attendance/${params ? `?${new URLSearchParams(params)}` : ""}`),
  revenue: (params?: Record<string, string>) =>
    requestJson(`/analytics/revenue/${params ? `?${new URLSearchParams(params)}` : ""}`),
  teachers: (params?: Record<string, string>) =>
    requestJson(`/analytics/teachers/${params ? `?${new URLSearchParams(params)}` : ""}`),
  teacherLessons: (params: { teacher_id: string; date_from?: string; date_to?: string }) =>
    requestJson(`/analytics/teacher-lessons/?${new URLSearchParams(params as Record<string, string>)}`),
  teacherSalary: (params?: Record<string, string>) =>
    requestJson(`/salary/me/${params ? `?${new URLSearchParams(params)}` : ""}`),
  staffSalary: (staffId: string, params: Record<string, string>) =>
    requestJson(`/salary/calculate/?teacher_id=${staffId}&${new URLSearchParams(params)}`),
  dailyReport: (params: { date: string }) =>
    requestJson(`/analytics/daily-report/?${new URLSearchParams(params)}`),
  groupReport: (groupId: string, params?: Record<string, string>) =>
    requestJson(`/analytics/group-report/${groupId}/${params ? `?${new URLSearchParams(params)}` : ""}`),
};

export const auditApi = {
  list: (params?: Record<string, string>) =>
    requestJson(`/audit/${params ? `?${new URLSearchParams(params)}` : ""}`),
};

export const transferApi = {
  transfer: (data: {
    student_id: string;
    from_group_id: string;
    to_group_id: string;
    transfer_date: string;
    reason?: string;
    comment?: string;
  }) =>
    requestJson("/transfers/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  history: (params?: { student_id?: string; branch_id?: string }) =>
    requestJson<unknown[]>(
      `/transfers/${params ? "?" + new URLSearchParams(params as Record<string, string>) : ""}`
    ),
};


export const superadminApi = {
  institutions: {
    ...crudApi("/superadmin/institutions/"),
    deleteForce: (id: string) =>
      requestJson<void>(`/superadmin/institutions/${id}/?force=true`, { method: "DELETE" }),
  },
  branches: {
    list: (institutionId: string) =>
      requestJson<ApiList<unknown> | unknown[]>(`/superadmin/institutions/${institutionId}/branches/`),
    create: (institutionId: string, data: unknown) =>
      requestJson(`/superadmin/institutions/${institutionId}/branches/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (institutionId: string, branchId: string, data: unknown) =>
      requestJson(`/superadmin/institutions/${institutionId}/branches/${branchId}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (institutionId: string, branchId: string) =>
      requestJson<void>(`/superadmin/institutions/${institutionId}/branches/${branchId}/`, {
        method: "DELETE",
      }),
  },
  freeze: (id: string, reason: string) =>
    requestJson(`/superadmin/institutions/${id}/freeze/`, {
      method: "PATCH",
      body: JSON.stringify({ message: reason }),
    }),
  unfreeze: (id: string) => requestJson(`/superadmin/institutions/${id}/unfreeze/`, { method: "PATCH" }),
  logs: (params?: Record<string, string>) =>
    requestJson(`/superadmin/logs/${params ? `?${new URLSearchParams(params)}` : ""}`),
  settings: {
    get: () => requestJson("/superadmin/settings/"),
    update: (data: Record<string, unknown>) =>
      requestJson("/superadmin/settings/1/", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
};

// ─── Quiz API ─────────────────────────────────────────────────────────────────

export const quizApi = {
  list: (params?: Record<string, string>) =>
    requestJson(`/quizzes/${params ? `?${new URLSearchParams(params)}` : ""}`),

  get: (id: string) => requestJson(`/quizzes/${id}/`),

  create: (data: Record<string, unknown>) =>
    requestJson("/quizzes/", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    requestJson(`/quizzes/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  delete: (id: string) => requestJson(`/quizzes/${id}/`, { method: "DELETE" }),

  addQuestion: (quizId: string, data: Record<string, unknown>) =>
    requestJson(`/quizzes/${quizId}/questions/`, { method: "POST", body: JSON.stringify(data) }),

  updateQuestion: (quizId: string, questionId: string, data: Record<string, unknown>) =>
    requestJson(`/quizzes/${quizId}/questions/${questionId}/`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteQuestion: (quizId: string, questionId: string) =>
    requestJson(`/quizzes/${quizId}/questions/${questionId}/`, { method: "DELETE" }),

  createSession: (quizId: string) =>
    requestJson(`/quizzes/${quizId}/sessions/`, { method: "POST" }),

  listSessions: (quizId: string) => requestJson(`/quizzes/${quizId}/sessions/`),

  sessions: {
    list: (params?: Record<string, string>) =>
      requestJson(`/quiz-sessions/${params ? `?${new URLSearchParams(params)}` : ""}`),

    get: (id: string) => requestJson(`/quiz-sessions/${id}/`),

    byCode: (code: string) => {
      const schema = getTenantSchema();
      const qs = schema ? `?schema=${encodeURIComponent(schema)}` : "";
      return requestJson(`/quiz-sessions/by-code/${code}/${qs}`);
    },

    join: (sessionId: string, data: Record<string, unknown>) => {
      const schema = getTenantSchema();
      const qs = schema ? `?schema=${encodeURIComponent(schema)}` : "";
      return requestJson(`/quiz-sessions/${sessionId}/join/${qs}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    forceFinish: (sessionId: string) =>
      requestJson(`/quiz-sessions/${sessionId}/force-finish/`, { method: "POST" }),

    kickParticipant: (sessionId: string, participantId: string) =>
      requestJson(`/quiz-sessions/${sessionId}/participants/${participantId}/`, { method: "DELETE" }),
  },
};

export const coinApi = {
  // Настройки (директор)
  settings: {
    get: () => requestJson("/coins/settings/me/"),
    update: (data: Record<string, unknown>) =>
      requestJson("/coins/settings/me/", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Кошелёк
  wallet: {
    my: () => requestJson("/coins/wallets/my/"),
    list: () => requestJson("/coins/wallets/"),
    award: (studentId: string, amount: number, comment: string) =>
      requestJson("/coins/wallets/award/", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, amount, comment }),
      }),
    deduct: (studentId: string, amount: number, comment: string) =>
      requestJson("/coins/wallets/deduct/", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, amount, comment }),
      }),
  },

  // Транзакции
  transactions: {
    list: (studentId?: string) =>
      requestJson(`/coins/transactions/${studentId ? `?student_id=${studentId}` : ""}`),
  },

  // Магазин
  products: {
    list: () => requestJson("/coins/products/"),
    get: (id: string) => requestJson(`/coins/products/${id}/`),
    create: (data: Record<string, unknown>) =>
      requestJson("/coins/products/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      requestJson(`/coins/products/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      requestJson(`/coins/products/${id}/`, { method: "DELETE" }),
    buy: (id: string) =>
      requestJson(`/coins/products/${id}/buy/`, { method: "POST" }),
  },

  // Категории
  categories: {
    list: () => requestJson("/coins/categories/"),
    create: (data: Record<string, unknown>) =>
      requestJson("/coins/categories/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      requestJson(`/coins/categories/${id}/`, { method: "DELETE" }),
  },

  // Заказы
  orders: {
    list: () => requestJson("/coins/orders/"),
    updateStatus: (id: string, status: string) =>
      requestJson(`/coins/orders/${id}/status/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },

  // Ачивки
  achievements: {
    list: () => requestJson("/coins/achievements/"),
    create: (data: Record<string, unknown>) =>
      requestJson("/coins/achievements/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      requestJson(`/coins/achievements/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      requestJson(`/coins/achievements/${id}/`, { method: "DELETE" }),
  },

  // Лидерборд
  leaderboard: {
    get: () => requestJson("/coins/leaderboard/"),
  },
};


