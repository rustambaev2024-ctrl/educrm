import { useAuth } from "@/lib/auth";

/**
 * Identity helpers now rely on IDs provided by backend auth payload.
 * No fallback mapping to demo names/datasets.
 */
export function useCurrentTeacherId(): string | undefined {
  const { user } = useAuth();
  if (!user || user.role !== "teacher") return undefined;
  return user.teacherId ?? user.profileId;
}

export function useCurrentStudentId(): string | undefined {
  const { user } = useAuth();
  if (!user || user.role !== "student") return undefined;
  return user.studentId ?? user.profileId;
}

export function useCurrentParentId(): string | undefined {
  const { user } = useAuth();
  if (!user || user.role !== "parent") return undefined;
  return user.parentId ?? user.profileId;
}
