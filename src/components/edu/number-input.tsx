import * as React from "react";

import { Input } from "@/components/ui/input";

/**
 * Поле для целых чисел.
 *
 * `<input type="number">` в браузерах ведёт себя неожиданно: колесо мыши над
 * сфокусированным полем молча меняет значение, стрелки вверх/вниз тоже, а ещё
 * принимаются «e», «+» и «-» (научная нотация) — при вводе количества монет
 * это приводит к тому, что начисляется не то, что человек видел на экране.
 *
 * Поэтому текстовое поле с `inputMode="numeric"`: на телефоне открывается
 * цифровая клавиатура, лишние символы не проходят, колесо ничего не портит.
 * Пустое значение остаётся пустым, а не превращается в 0, — иначе поле
 * невозможно очистить, чтобы ввести число заново.
 */
export interface NumberInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: string | number;
  onValueChange: (value: string) => void;
  /** Разрешить отрицательные значения (например, остаток «-1 = ∞»). */
  allowNegative?: boolean;
}

export function NumberInput({
  value,
  onValueChange,
  allowNegative = false,
  ...props
}: NumberInputProps) {
  const sanitize = (raw: string) => {
    const negative = allowNegative && raw.trim().startsWith("-");
    const digits = raw.replace(/\D/g, "");
    return negative && digits ? `-${digits}` : negative ? "-" : digits;
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onValueChange(sanitize(e.target.value))}
    />
  );
}
