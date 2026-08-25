// Детерминированный цвет аватара по имени: один человек — всегда один цвет.
// Насыщенные -500 читаемы с белым текстом и в светлой, и в тёмной теме.
const COLORS = [
  "avatar-palette-0",
  "avatar-palette-1",
  "avatar-palette-2",
  "avatar-palette-3",
  "avatar-palette-4",
];

export function getAvatarColor(name: string): string {
  if (!name) return COLORS[0];
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}
