import type { AttendanceRecord } from "@/lib/data/types";
import { isCountedForAttendance, isPresent } from "@/lib/data/definitions";

/**
 * Процент посещаемости по общему правилу платформы.
 *
 * Само правило (кто считается присутствующим и что попадает в знаменатель)
 * живёт в definitions.ts — там же его зеркало на бэкенде и тест, который не
 * даёт сторонам разойтись.
 */
export function attendancePercentage(records: AttendanceRecord[]): number {
  const counted = records.filter(isCountedForAttendance);
  if (counted.length === 0) return 0;
  const present = counted.filter(isPresent).length;
  return Math.round((present / counted.length) * 100);
}
