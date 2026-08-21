import { test, expect } from "@playwright/test";
import { gradeAverage, gradeTone } from "../src/lib/data/metrics";

test.describe("gradeAverage", () => {
  test("пустой список -> 0", () => {
    expect(gradeAverage([])).toBe(0);
  });

  test("считает среднее по шкале 2-5", () => {
    expect(gradeAverage([{ score: 5 }, { score: 4 }, { score: 3 }])).toBe(4);
  });

  test("округляет до одного знака", () => {
    expect(gradeAverage([{ score: 5 }, { score: 4 }, { score: 4 }])).toBe(4.3);
  });
});

test.describe("gradeTone", () => {
  test("5 и близко к нему -> ok", () => {
    expect(gradeTone(5)).toContain("text-success");
    expect(gradeTone(4.5)).toContain("text-success");
  });

  test("4 -> info", () => {
    expect(gradeTone(4)).toContain("text-info");
    expect(gradeTone(3.5)).toContain("text-info");
  });

  test("3 -> warning", () => {
    expect(gradeTone(3)).toContain("text-warning");
    expect(gradeTone(2.5)).toContain("text-warning");
  });

  test("2 -> destructive", () => {
    expect(gradeTone(2)).toContain("text-destructive");
  });
});
