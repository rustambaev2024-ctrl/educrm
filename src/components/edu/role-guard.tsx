import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import { ROLE_HOMES } from "@/lib/roles";
import type { ReactNode } from "react";

export function RoleGuard({ allow, children }: { allow: Role; children: ReactNode }) {
  const { user, isHydrating } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isHydrating) return;
    if (!user) {
      navigate({ to: "/" });
    } else if (user.role !== allow) {
      navigate({ to: ROLE_HOMES[user.role] });
    }
  }, [user, allow, navigate, isHydrating]);

  if (isHydrating || !user || user.role !== allow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
