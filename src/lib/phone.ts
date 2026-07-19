export function formatUzPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  while (digits.startsWith("998")) {
    digits = digits.slice(3);
  }
  const limited = digits.slice(0, 9);

  const parts = [
    limited.slice(0, 2),
    limited.slice(2, 5),
    limited.slice(5, 7),
    limited.slice(7, 9),
  ].filter(Boolean);

  return ["+998", ...parts].join(" ");
}

