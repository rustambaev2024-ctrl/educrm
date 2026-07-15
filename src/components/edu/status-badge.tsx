import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { GroupStatus, LessonStatus, StudentStatus } from "@/lib/data/types";

const STUDENT_TONE: Record<StudentStatus, string> = {
  active: "bg-success/15 text-success border-success/25",
  frozen: "bg-info/15 text-info border-info/25",
  debtor: "bg-destructive/15 text-destructive border-destructive/25",
  archived: "bg-muted text-muted-foreground border-border",
  graduate: "bg-accent text-accent-foreground border-primary/30",
  expelled: "bg-warning/15 text-warning-foreground border-warning/30",
};

const GROUP_TONE: Record<GroupStatus, string> = {
  recruiting: "bg-info/15 text-info border-info/25",
  active: "bg-success/15 text-success border-success/25",
  frozen: "bg-warning/15 text-warning-foreground border-warning/30",
  completed: "bg-muted text-muted-foreground border-border",
};

const LESSON_TONE: Record<LessonStatus, string> = {
  scheduled: "bg-info/15 text-info border-info/25",
  completed: "bg-success/15 text-success border-success/25",
  cancelled: "bg-destructive/15 text-destructive border-destructive/25",
  rescheduled: "bg-warning/15 text-warning-foreground border-warning/30",
};

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm ${tone}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const { t } = useI18n();
  return <Pill tone={STUDENT_TONE[status]}>{t(`status.${status}`)}</Pill>;
}

export function GroupStatusBadge({ status }: { status: GroupStatus }) {
  const { t } = useI18n();
  return <Pill tone={GROUP_TONE[status]}>{t(`gstatus.${status}`)}</Pill>;
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const { t } = useI18n();
  return <Pill tone={LESSON_TONE[status]}>{t(`lstatus.${status}`)}</Pill>;
}
