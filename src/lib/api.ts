const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!RAW_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required");
}

export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

export const TENANT_SCHEMA_KEY = "educrm.tenant_schema";
export const AUTH_KEY = "educrm.auth";

export type UserRole = "superadmin" | "director" | "admin" | "branch_admin" | "teacher" | "student" | "parent";

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
  return stored ?? (import.meta.env.DEV ? import.meta.env.VITE_DEFAULT_TENANT_SCHEMA ?? "" : "");
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

  const makeRequest = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    });

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

    // Login must not reuse a stale tenant from localStorage. The backend resolves
    // the correct tenant by phone for /auth/token/.
    return fetch(`${API_BASE_URL}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

export const branchApi = crudApi("/branches/");
export const roomApi = crudApi("/rooms/");

export const staffApi = {
  ...crudApi("/staff/"),
  salary: (staffId: string, params: { period_start: string; period_end: string; percent: number }) =>
    requestJson(`/staff/${staffId}/salary/`, {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

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
};

export const studentApi = {
  ...crudApi("/students/"),
  createWithFiles: (data: FormData) => requestForm("/students/", data),
  me: () => requestJson("/student/me/"),
  mySchedule: () => requestJson("/student/me/schedule/"),
  myAttendance: () => requestJson("/student/me/attendance/"),
  myGrades: () => requestJson("/student/me/grades/"),
  myHomeworks: () => requestJson("/student/me/homeworks/"),
  myWallet: () => requestJson("/student/me/wallet/"),
};

export const parentApi = {
  list: () => requestJson("/parents/"),
  me: () => requestJson("/parent/me/"),
  children: () => requestJson("/parent/me/children/"),
  linkChild: (studentId: string) =>
    requestJson("/parent/me/children/link/", {
      method: "POST",
      body: JSON.stringify({ student_id: studentId }),
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
};

export const attendanceApi = {
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
      body: JSON.stringify({ student: studentId, transaction_type: "top_up", ...data }),
    }),
  debtors: (branchId?: string) => requestJson(`/payments/debtors/${branchId ? `?branch=${branchId}` : ""}`),
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
  markRead: (id: string) => requestJson(`/notifications/${id}/read/`, { method: "POST" }),
  markAllRead: () => requestJson("/notifications/read-all/", { method: "POST" }),
};

export const analyticsApi = {
  overview: (params?: Record<string, string>) =>
    requestJson(`/analytics/overview/${params ? `?${new URLSearchParams(params)}` : ""}`),
  attendance: (params?: Record<string, string>) =>
    requestJson(`/analytics/attendance/${params ? `?${new URLSearchParams(params)}` : ""}`),
  revenue: (params?: Record<string, string>) =>
    requestJson(`/analytics/revenue/${params ? `?${new URLSearchParams(params)}` : ""}`),
};

export const auditApi = {
  list: (params?: Record<string, string>) =>
    requestJson(`/audit/${params ? `?${new URLSearchParams(params)}` : ""}`),
};

export const superadminApi = {
  institutions: crudApi("/superadmin/institutions/"),
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
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  unfreeze: (id: string) => requestJson(`/superadmin/institutions/${id}/unfreeze/`, { method: "POST" }),
  logs: (params?: Record<string, string>) =>
    requestJson(`/superadmin/logs/${params ? `?${new URLSearchParams(params)}` : ""}`),
};


