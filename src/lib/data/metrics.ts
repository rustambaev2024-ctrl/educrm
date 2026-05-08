import type { AttendanceRecord } from "@/lib/data/types";

const PRESENT_STATUSES = new Set(["present", "late", "online"]);

export function attendancePercentage(records: AttendanceRecord[]): number {
  const counted = records.filter((record) => record.status !== "excused");
  if (counted.length === 0) return 0;
  const present = counted.filter((record) => PRESENT_STATUSES.has(record.status)).length;
  return Math.round((present / counted.length) * 100);
}
