import { useRef, useState, useEffect, useId } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DateInputProps = {
  /** Значение в ISO-формате `YYYY-MM-DD`. Пустая строка — дата не задана. */
  value: string;
  /** Совместим по форме с `<input onChange>`, чтобы потребители не переписывались. */
  onChange: (event: { target: { value: string } }) => void;
  /** Нижняя граница, ISO `YYYY-MM-DD`. */
  minDate?: string;
  /** Верхняя граница, ISO `YYYY-MM-DD`. */
  maxDate?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

type Segments = { d: string; m: string; y: string };

function parseIso(value: string): Segments {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return { d: "", m: "", y: "" };
  return { y: match[1], m: match[2], d: match[3] };
}

function toIso(d: string, m: string, y: string): string {
  if (d.length === 2 && m.length === 2 && y.length === 4) {
    return `${y}-${m}-${d}`;
  }
  return "";
}

/** Существует ли такая календарная дата (отсекает 31.02, 31.04 и т.п.). */
function isRealDate(iso: string): boolean {
  const { d, m, y } = parseIso(iso);
  if (!d || !m || !y) return false;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)
  );
}

/**
 * Сегодняшняя дата в ISO по ЛОКАЛЬНОМУ времени.
 * `new Date().toISOString()` отдаёт UTC — в Узбекистане (UTC+5) с 00:00 до 05:00
 * это вчерашний день, и граница min/max ошибалась бы на сутки.
 */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** ISO-даты одинаковой длины сравнимы лексикографически — отдельный парсинг для min/max не нужен. */
function isoToHuman(iso: string): string {
  const { d, m, y } = parseIso(iso);
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/**
 * Явные сегменты дд/мм/гггг вместо нативного `<input type="date">`.
 *
 * Нативный контрол при быстром вводе 8 цифр подряд без клика в сегмент
 * распределяет цифры по внутреннему keyboard-navigation state браузера,
 * а не по видимому порядку — «07192026» могло дать 07.12.2026 вместо
 * 19.07.2026 молча, без валидации (QA BUG). Явные сегменты с авто-переходом
 * фокуса убирают эту неоднозначность полностью.
 *
 * Наружу отдаётся только валидная дата: несуществующая (31.02) или выходящая
 * за `minDate`/`maxDate` даёт `value: ""` плюс видимое сообщение об ошибке,
 * поэтому потребителю невозможно сохранить мусор.
 *
 * `id` вешается на сегмент дня, а не на обёртку — иначе `<Label htmlFor>`
 * у обоих потребителей указывал бы на `<div>` и клик по подписи не давал фокус.
 */
export function DateInput({
  value,
  onChange,
  minDate,
  maxDate,
  id,
  name,
  disabled,
  required,
  className,
}: DateInputProps) {
  const { t, tf } = useI18n();
  const autoId = useId();
  const dayId = id ?? `${autoId}-day`;
  const errorId = `${dayId}-error`;

  const [seg, setSeg] = useState<Segments>(() => parseIso(value));
  const [error, setError] = useState<string | null>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  // Что мы сами в последний раз отдали наружу. Без этого сброс value в ""
  // (при невалидной дате) прилетал бы обратно через эффект и стирал набранное.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setSeg(parseIso(value));
    setError(null);
  }, [value]);

  const emit = (next: Segments) => {
    const iso = toIso(next.d, next.m, next.y);

    if (!iso) {
      setError(null);
      if (!next.d && !next.m && !next.y && lastEmitted.current !== "") {
        lastEmitted.current = "";
        onChange({ target: { value: "" } });
      }
      return;
    }

    let message: string | null = null;
    if (!isRealDate(iso)) message = t("date.err.invalid");
    else if (minDate && iso < minDate) message = tf("date.err.min", { min: isoToHuman(minDate) });
    else if (maxDate && iso > maxDate) message = tf("date.err.max", { max: isoToHuman(maxDate) });

    setError(message);
    const emitted = message ? "" : iso;
    lastEmitted.current = emitted;
    onChange({ target: { value: emitted } });
  };

  const handleSegment = (
    key: keyof Segments,
    raw: string,
    max: number,
    nextRef: React.RefObject<HTMLInputElement | null> | null,
  ) => {
    const digits = raw.replace(/\D/g, "").slice(0, max);
    const next = { ...seg, [key]: digits };
    setSeg(next);
    emit(next);
    if (digits.length === max && nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select();
    }
  };

  /** Backspace в пустом сегменте возвращает фокус в предыдущий — как в нативном контроле. */
  const handleBackspace = (
    event: React.KeyboardEvent<HTMLInputElement>,
    current: string,
    prevRef: React.RefObject<HTMLInputElement | null> | null,
  ) => {
    if (event.key !== "Backspace" || current !== "" || !prevRef?.current) return;
    event.preventDefault();
    prevRef.current.focus();
    prevRef.current.select();
  };

  const segmentClass = cn(
    "h-9 rounded-md border border-input bg-transparent px-2 text-center text-sm shadow-sm",
    "transition-colors duration-200 placeholder:text-muted-foreground",
    "hover:border-ring/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50",
    error && "border-destructive focus-visible:ring-destructive",
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="group"
        aria-label={t("date.aria.group")}
        aria-describedby={error ? errorId : undefined}
        className="flex items-center gap-1.5"
      >
        <input
          id={dayId}
          ref={dayRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("date.aria.day")}
          aria-invalid={error ? true : undefined}
          placeholder={t("date.ph.day")}
          maxLength={2}
          value={seg.d}
          disabled={disabled}
          required={required}
          onKeyDown={(e) => handleBackspace(e, seg.d, null)}
          onChange={(e) => handleSegment("d", e.target.value, 2, monthRef)}
          className={cn(segmentClass, "w-12")}
        />
        <span aria-hidden="true" className="text-muted-foreground">
          .
        </span>
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("date.aria.month")}
          aria-invalid={error ? true : undefined}
          placeholder={t("date.ph.month")}
          maxLength={2}
          value={seg.m}
          disabled={disabled}
          required={required}
          onKeyDown={(e) => handleBackspace(e, seg.m, dayRef)}
          onChange={(e) => handleSegment("m", e.target.value, 2, yearRef)}
          className={cn(segmentClass, "w-12")}
        />
        <span aria-hidden="true" className="text-muted-foreground">
          .
        </span>
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("date.aria.year")}
          aria-invalid={error ? true : undefined}
          placeholder={t("date.ph.year")}
          maxLength={4}
          value={seg.y}
          disabled={disabled}
          required={required}
          onKeyDown={(e) => handleBackspace(e, seg.y, monthRef)}
          onChange={(e) => handleSegment("y", e.target.value, 4, null)}
          className={cn(segmentClass, "w-16")}
        />
        {/* Значение для нативной отправки формы: сегменты сами по себе не имеют name. */}
        {name ? <input type="hidden" name={name} value={value} /> : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
