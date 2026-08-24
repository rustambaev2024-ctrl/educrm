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

export interface GradeLike {
  score: number;
}

/**
 * Средний балл по шкале 2–5.
 *
 * Раньше формула "(score/maxScore)*100" (или *10 — в разных файлах
 * по-разному) была продублирована в шести местах фронтенда, каждое со
 * своей интерпретацией шкалы. После перехода на 2–5 сама оценка уже
 * конечное число — пересчитывать её в проценты незачем, среднее — это
 * просто среднее.
 */
export function gradeAverage(grades: GradeLike[]): number {
  if (grades.length === 0) return 0;
  const sum = grades.reduce((total, g) => total + g.score, 0);
  return Math.round((sum / grades.length) * 10) / 10;
}

/**
 * Цветовая категория по значению оценки (2–5 или их среднему).
 *
 * Пороги — не сдвинуты: раньше это были 85/65/50 в процентах, применённые
 * к тому же самому диапазону, что теперь и есть сама оценка.
 */
export function gradeTone(value: number): string {
  if (value >= 4.5) return "bg-success/15 text-success";
  if (value >= 3.5) return "bg-info/15 text-info";
  if (value >= 2.5) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}
