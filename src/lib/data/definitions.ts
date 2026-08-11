/**
 * Единственное место во фронте, где записаны определения показателей.
 *
 * Зеркало backend/apps/core/definitions.py — там же объяснено, почему каждое
 * определение выглядит именно так. Расхождение между сторонами ловит
 * backend/tests/test_definitions_parity.py: поменять здесь и не поменять там
 * (или наоборот) нельзя, тест упадёт.
 *
 * Правило: если определение нужно на втором экране — оно импортируется отсюда.
 * До 9 августа 2026 «активных учеников» считали тремя способами на трёх
 * экранах, и все три числа были разными.
 */

import type { AttendanceRecord, Student } from "@/lib/data/types";

// ─────────────────────────── Посещаемость ───────────────────────────

/** Отметки, которые считаются присутствием. */
export const ATTENDANCE_PRESENT_STATUSES = ["present", "late"] as const;

/**
 * Отметки, попадающие в знаменатель. "excused" исключён: посещаемость мерит
 * дисциплину, а не болезни.
 */
export const ATTENDANCE_COUNTED_STATUSES = ["present", "late", "absent"] as const;

const PRESENT = new Set<string>(ATTENDANCE_PRESENT_STATUSES);
const COUNTED = new Set<string>(ATTENDANCE_COUNTED_STATUSES);

export function isPresent(record: Pick<AttendanceRecord, "status">): boolean {
  return PRESENT.has(record.status);
}

export function isCountedForAttendance(record: Pick<AttendanceRecord, "status">): boolean {
  return COUNTED.has(record.status);
}

// ──────────────────────────── Ученики ────────────────────────────

/** «Учится сейчас». Замороженные не входят — заморозка и означает паузу. */
export const ACTIVE_STUDENT_STATUSES = ["active", "debtor"] as const;

/** «Числится в центре, не выбыл» — шире предыдущего на "frozen". */
export const ENROLLED_STUDENT_STATUSES = ["active", "debtor", "frozen"] as const;

/** Статусы, исключающие ученика из обоих наборов выше. */
export const INACTIVE_STUDENT_STATUSES = ["archived", "graduate", "expelled"] as const;

const ACTIVE = new Set<string>(ACTIVE_STUDENT_STATUSES);
const ENROLLED = new Set<string>(ENROLLED_STUDENT_STATUSES);

type StudentLike = Pick<Student, "status" | "balance">;

export function isActiveStudent(student: Pick<Student, "status">): boolean {
  return ACTIVE.has(student.status);
}

export function isEnrolledStudent(student: Pick<Student, "status">): boolean {
  return ENROLLED.has(student.status);
}

/**
 * Должник определяется ТОЛЬКО по балансу.
 *
 * Статус "debtor" — производная величина, которую бэкенд пересчитывает при
 * каждой операции, и она умеет расходиться с балансом. Пока статус участвует
 * в вычислениях, он остаётся вторым источником правды. Как метку в таблице
 * его показывать можно, считать по нему — нет.
 */
export function isDebtor(student: Pick<Student, "balance">): boolean {
  return student.balance < 0;
}

export function countActiveStudents(students: Pick<Student, "status">[]): number {
  return students.filter(isActiveStudent).length;
}

export function countDebtors(students: Pick<Student, "balance">[]): number {
  return students.filter(isDebtor).length;
}

/**
 * Сумма долга по всем должникам — положительное число.
 * Округляется до тийина: складывать сотни Number-значений без округления
 * значит получить итог, не совпадающий с Decimal-итогом бэкенда.
 */
export function totalDebt(students: StudentLike[]): number {
  const raw = students.reduce((sum, s) => (isDebtor(s) ? sum + Math.abs(s.balance) : sum), 0);
  return Math.round(raw * 100) / 100;
}

// ──────────────────────────── Деньги ────────────────────────────

/** Поступления в кассу. */
export const INCOME_PAYMENT_TYPES = ["top_up", "manual_top_up"] as const;

/** Списания с кошелька. */
export const CHARGE_PAYMENT_TYPES = ["charge", "manual_charge"] as const;

/** Отмена поступления — вычитается из выручки, иначе операция и её отмена дают не ноль. */
export const INCOME_REVERSAL_TYPES = ["manual_charge"] as const;
