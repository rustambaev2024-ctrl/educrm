import { expect, test } from "@playwright/test";

import {
  countActiveStudents,
  countDebtors,
  isActiveStudent,
  isDebtor,
  isEnrolledStudent,
  totalDebt,
} from "@/lib/data/definitions";
import { attendancePercentage } from "@/lib/data/metrics";
import { sumExpense, sumIncome } from "@/lib/data/mappers";
import type { AttendanceRecord, Student } from "@/lib/data/types";

/**
 * Определения показателей — чистые функции, поэтому проверяются без браузера
 * и без входа в систему. Тест закрывает раздел «одна подпись, разные числа»
 * аудита 9 августа 2026 со стороны фронта; со стороны бэкенда то же самое
 * проверяют backend/tests/test_definitions_parity.py и
 * backend/tests/test_report_definitions.py.
 *
 * Оба профиля (chromium/mobile) прогоняют это одинаково — логика от устройства
 * не зависит, дубль стоит доли секунды.
 */

const student = (patch: Partial<Student>): Student =>
  ({
    id: "s",
    fullName: "Test",
    phone: "+998900000000",
    branchId: "b",
    status: "active",
    registeredAt: "2026-01-01",
    balance: 0,
    groupIds: [],
    documents: [],
    ...patch,
  }) as Student;

const mark = (status: AttendanceRecord["status"]): AttendanceRecord => ({
  id: `a-${status}-${Math.random()}`,
  lessonId: "l",
  studentId: "s",
  status,
});

test.describe("определения учеников", () => {
  test("должник определяется по балансу, а не по статусу", () => {
    expect(isDebtor(student({ status: "active", balance: -1000 })), "минусовой баланс при статусе active — должник").toBe(true);
    expect(isDebtor(student({ status: "debtor", balance: 0 })), "нулевой баланс при статусе debtor — не должник").toBe(false);
    expect(isDebtor(student({ balance: 0 }))).toBe(false);
  });

  test("активным считается тот, кто учится сейчас; замороженный — нет", () => {
    expect(isActiveStudent(student({ status: "active" }))).toBe(true);
    expect(isActiveStudent(student({ status: "debtor" })), "должник продолжает учиться").toBe(true);
    expect(isActiveStudent(student({ status: "frozen" })), "заморозка и означает паузу").toBe(false);
    expect(isActiveStudent(student({ status: "expelled" }))).toBe(false);
    expect(isActiveStudent(student({ status: "graduate" }))).toBe(false);
    expect(isActiveStudent(student({ status: "archived" }))).toBe(false);
  });

  test("«числится» шире «учится сейчас» ровно на заморозку", () => {
    expect(isEnrolledStudent(student({ status: "frozen" }))).toBe(true);
    expect(isEnrolledStudent(student({ status: "expelled" }))).toBe(false);
  });

  test("отчисленные не попадают в счётчик активных", () => {
    const list = [
      student({ status: "active" }),
      student({ status: "debtor", balance: -500 }),
      student({ status: "frozen" }),
      student({ status: "expelled" }),
      student({ status: "graduate" }),
    ];
    expect(countActiveStudents(list)).toBe(2);
    expect(countDebtors(list)).toBe(1);
  });

  test("сумма долга округляется до тийина", () => {
    const list = Array.from({ length: 3 }, () => student({ balance: -0.1 }));
    expect(totalDebt(list), "0.1 + 0.1 + 0.1 в двоичной плавающей точке даёт 0.30000000000000004").toBe(0.3);
  });
});

test.describe("посещаемость", () => {
  test("уважительный пропуск не входит в знаменатель", () => {
    expect(attendancePercentage([mark("present"), mark("excused")])).toBe(100);
  });

  test("прогул входит — иначе предыдущая проверка ничего не мерит", () => {
    expect(attendancePercentage([mark("present"), mark("absent")])).toBe(50);
  });

  test("опоздание считается присутствием", () => {
    expect(attendancePercentage([mark("late")])).toBe(100);
  });

  test("журнал только из уважительных даёт 0, а не деление на ноль", () => {
    expect(attendancePercentage([mark("excused"), mark("excused")])).toBe(0);
    expect(attendancePercentage([])).toBe(0);
  });
});

test.describe("деньги", () => {
  const row = (type: string, amount: number) => ({ type, amount });

  test("отмена пополнения вычитается из дохода", () => {
    expect(sumIncome([row("top_up", 300_000), row("manual_charge", 300_000)])).toBe(0);
  });

  test("ручное пополнение — доход, списание за урок — нет", () => {
    expect(sumIncome([row("manual_top_up", 120_000), row("charge", 50_000)])).toBe(120_000);
  });

  test("расход — только реальный отток из кассы", () => {
    expect(sumExpense([row("expense", 10_000), row("charge", 50_000)])).toBe(10_000);
  });

  test("итог округляется до тийина", () => {
    const rows = Array.from({ length: 3 }, () => row("top_up", 0.1));
    expect(sumIncome(rows)).toBe(0.3);
  });
});
