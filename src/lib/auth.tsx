import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authApi, setTenantSchema, setTenantSlug, saveTokens, AUTH_KEY, TENANT_SCHEMA_KEY, TENANT_SLUG_KEY, type AuthUser as ApiAuthUser } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthUser = ApiAuthUser;

interface AuthState {
  user: AuthUser | null;
  access: string | null;
  refresh: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** true пока идёт первичная проверка сессии */
  isHydrating: boolean;
  login: (phone: string, password: string, slug?: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readStorage(): AuthState {
  if (typeof window === "undefined") return { user: null, access: null, refresh: null };
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return { user: null, access: null, refresh: null };
    const p = JSON.parse(raw);

    // Поддержка старого формата { user, tokens: { access, refresh } }
    if (p?.tokens?.access) {
      return {
        user: p.user ?? null,
        access: p.tokens.access,
        refresh: p.tokens.refresh,
      };
    }

    // Новый формат { user, access, refresh }
    return {
      user: p.user ?? null,
      access: p.access ?? null,
      refresh: p.refresh ?? null,
    };
  } catch {
    return { user: null, access: null, refresh: null };
  }
}

function writeStorage(state: AuthState) {
  if (typeof window === "undefined") return;
  if (!state.access || !state.refresh || !state.user) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

function clearStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TENANT_SCHEMA_KEY);
  localStorage.removeItem(TENANT_SLUG_KEY);
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    access: null,
    refresh: null,
  });
  const [isHydrating, setIsHydrating] = useState(true);
  const bootDone = useRef(false);

  // ── Boot: читаем localStorage → валидируем через /auth/me/ ─────────────────
  useEffect(() => {
    if (bootDone.current) return;
    bootDone.current = true;

    async function boot() {
      const stored = readStorage();

      // Нет токенов — не авторизован
      if (!stored.access || !stored.refresh) {
        setIsHydrating(false);
        return;
      }

      // Есть токены — проверяем их актуальность
      try {
        const me = await authApi.me();
        const next: AuthState = {
          user: me as AuthUser,
          access: stored.access,
          refresh: stored.refresh,
        };
        setTenantSchema(me.schemaName ?? null);
        writeStorage(next);
        setState(next);
      } catch (err: unknown) {
        // access протух — пробуем refresh
        if (isHttpError(err, 401) && stored.refresh) {
          try {
            const refreshed = await authApi.refresh(stored.refresh);
            saveTokens(refreshed.access, stored.refresh);

            const me = await authApi.me();
            const next: AuthState = {
              user: me as AuthUser,
              access: refreshed.access,
              refresh: stored.refresh,
            };
            setTenantSchema(me.schemaName ?? null);
            writeStorage(next);
            setState(next);
          } catch {
            // refresh тоже не работает — сбрасываем
            clearStorage();
          }
        } else {
          clearStorage();
        }
      } finally {
        setIsHydrating(false);
      }
    }

    boot();
  }, []);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = async (phone: string, password: string, slug?: string) => {
    clearStorage();
    // Сохраняем slug до логина, чтобы buildTenantHeaders() использовал его в запросе
    if (slug) setTenantSlug(slug);
    const payload = await authApi.login({ phone, password, slug });

    const loginUser: AuthUser = payload.user as AuthUser;
    const schema = loginUser.schemaName ?? payload.schemaName;
    if (schema) setTenantSchema(schema);
    const responseSlug = (payload as { tenantSlug?: string }).tenantSlug;
    if (responseSlug) setTenantSlug(responseSlug);

    saveTokens(payload.access, payload.refresh);
    const user = (await authApi.me()) as AuthUser;

    const next: AuthState = {
      user,
      access: payload.access,
      refresh: payload.refresh,
    };

    writeStorage(next);
    setState(next);
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      if (state.refresh) await authApi.logout(state.refresh);
    } catch {
      // токен мог уже протухнуть — не критично
    } finally {
      clearStorage();
      setState({ user: null, access: null, refresh: null });
    }
  };

  // ── Context value ────────────────────────────────────────────────────────────
  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      isAuthenticated: !!state.user && !!state.access,
      isHydrating,
      login,
      logout,
    }),
    [state, isHydrating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function isHttpError(err: unknown, status: number): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === status;
}
