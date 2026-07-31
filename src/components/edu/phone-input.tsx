import { Input } from "@/components/ui/input";
import { formatUzPhone, localDigitsBefore } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "onChange"> & {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

// Позиция в отформатированной строке сразу после localDigitCount-й цифры
// НОМЕРНОЙ части (т.е. без учёта "998" из префикса "+998 ", который тоже
// состоит из цифр и иначе сбивал бы подсчёт — см. localDigitsBefore).
function positionAfterLocalDigits(formatted: string, localDigitCount: number): number {
  const prefixEnd = formatted.indexOf(" ") + 1 || formatted.length;
  if (localDigitCount <= 0) return prefixEnd;
  let seen = 0;
  for (let i = prefixEnd; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === localDigitCount) return i + 1;
    }
  }
  return formatted.length;
}

export function PhoneInput({ value, onChange, onFocus, placeholder = "+998 91 423 51 41", ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      placeholder={placeholder}
      value={typeof value === "string" ? formatUzPhone(value) : value}
      onFocus={(event) => {
        if (!event.currentTarget.value) {
          event.currentTarget.value = "+998 ";
          onChange(event);
        }
        onFocus?.(event);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const raw = input.value;
        const caret = input.selectionStart ?? raw.length;
        const localDigitCount = localDigitsBefore(raw, caret);
        const formatted = formatUzPhone(raw);
        input.value = formatted;
        // Без явного восстановления курсора controlled-инпут после форматирования
        // ставит каретку в конец строки — при select-all-и-перепечатывании (когда
        // курсор до этого не был в конце) следующая цифра уходит не туда и маска
        // "разъезжается" (QA BUG). Восстанавливаем позицию по числу цифр номерной
        // части слева от каретки (без учёта цифр самого префикса "+998 ").
        const nextPos = positionAfterLocalDigits(formatted, localDigitCount);
        onChange(event);
        requestAnimationFrame(() => {
          input.setSelectionRange(nextPos, nextPos);
        });
      }}
    />
  );
}
