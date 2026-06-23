import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import { ROLE_HOMES } from "@/lib/roles";
import type { ReactNode } from "react";

export function RoleGuard({ allow, children }: { allow: Role | Role[]; children: ReactNode }) {
  const { user, isHydrating } = useAuth();
  const navigate = useNavigate();
  const allowed = Array.isArray(allow) ? allow : [allow];

  useEffect(() => {
    if (isHydrating) return;
    if (!user) {
      navigate({ to: "/" });
    } else if (!allowed.includes(user.role)) {
      navigate({ to: ROLE_HOMES[user.role] });
    }
  }, [user, allowed, navigate, isHydrating]);

  if (isHydrating || !user || !allowed.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
