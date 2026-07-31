function stripLeading998(digits: string): string {
  let result = digits;
  while (result.startsWith("998")) {
    result = result.slice(3);
  }
  return result;
}

export function formatUzPhone(value: string): string {
  const digits = stripLeading998(value.replace(/\D/g, ""));
  const limited = digits.slice(0, 9);

  const parts = [
    limited.slice(0, 2),
    limited.slice(2, 5),
    limited.slice(5, 7),
    limited.slice(7, 9),
  ].filter(Boolean);

  return ["+998", ...parts].join(" ");
}

// Сколько цифр НОМЕРНОЙ части (после срезки ведущих "998" — т.е. то же, что
// реально попадёт в отформатированный номер) находится до caretPos в сыром вводе.
export function localDigitsBefore(raw: string, caretPos: number): number {
  const upToCaret = raw.slice(0, caretPos).replace(/\D/g, "");
  return stripLeading998(upToCaret).length;
}

