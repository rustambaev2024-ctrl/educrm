import type { Lang } from "./i18n";

export function formatMoney(amount: number, lang: Lang = "uz"): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const grouped = abs.toLocaleString(lang === "uz" ? "uz-Latn" : "ru-RU", {
    maximumFractionDigits: 0,
  });
  const suffix = lang === "uz" ? " so'm" : " сум";
  return `${sign}${grouped}${suffix}`;
}

export function formatDate(iso: string, lang: Lang = "uz"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatDateTime(iso: string, lang: Lang = "uz"): string {
  return `${formatDate(iso, lang)} · ${formatTime(iso)}`;
}

export function dayLabel(day: number, lang: Lang = "uz", short = false): string {
  const map: Record<Lang, [string, string][]> = {
    uz: [
      ["Du", "Dushanba"],
      ["Se", "Seshanba"],
      ["Cho", "Chorshanba"],
      ["Pa", "Payshanba"],
      ["Ju", "Juma"],
      ["Sha", "Shanba"],
      ["Yak", "Yakshanba"],
    ],
    ru: [
      ["Пн", "Понедельник"],
      ["Вт", "Вторник"],
      ["Ср", "Среда"],
      ["Чт", "Четверг"],
      ["Пт", "Пятница"],
      ["Сб", "Суббота"],
      ["Вс", "Воскресенье"],
    ],
  };
  const idx = Math.max(0, Math.min(6, day - 1));
  return short ? map[lang][idx][0] : map[lang][idx][1];
}

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Monday = 1
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoDay(d: Date): number {
  // 1 = Mon ... 7 = Sun
  return ((d.getDay() + 6) % 7) + 1;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}