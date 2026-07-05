import type { Lang } from "@/lib/i18n";

/**
 * Извлекает человекочитаемое сообщение из ошибки API (ApiError с .body),
 * учитывая двуязычный формат detail: {uz, ru} | string.
 * Возвращает fallback, если сервер не прислал понятного текста.
 */
export function apiErrorText(err: unknown, lang: Lang, fallback?: string): string {
  const fb = fallback ?? (lang === "uz" ? "Noma'lum xatolik yuz berdi" : "Произошла неизвестная ошибка");
  const body = (err as { body?: unknown })?.body;

  const pick = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const localized = obj[lang] ?? obj.uz ?? obj.ru;
      if (typeof localized === "string" && localized.trim()) return localized.trim();
    }
    return null;
  };

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const detail = pick(b.detail) ?? pick(b.message) ?? pick(b.error);
    if (detail) return detail;
  }

  const message = (err as { message?: unknown })?.message;
  if (typeof message === "string" && message.trim() && !message.startsWith("API ")) {
    return message.trim();
  }

  return fb;
}
