import type { LucideIcon } from "lucide-react";

/**
 * Модель навигации — чистые правила без React и без разметки.
 *
 * Вынесено отдельно от AppShell намеренно: это единственная часть каркаса,
 * где есть неочевидная логика, и её нужно уметь проверять напрямую, а не
 * через поднятый браузер и вход в систему.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Заголовок группы в боковом меню. Пункты без него идут первыми, без заголовка. */
  section?: string;
  /**
   * Попадает в нижние вкладки на телефоне. Не больше четырёх на роль —
   * пятое место занимает «Ещё». Если не отмечено ни одного, берутся первые.
   */
  primary?: boolean;
  badge?: number;
}

/** Сколько пунктов помещается в нижнюю панель, если «Ещё» не нужно. */
export const MAX_TABS_WITHOUT_MORE = 5;
/** Сколько пунктов остаётся под вкладки, когда «Ещё» нужно. */
export const TABS_BESIDE_MORE = 4;

/**
 * Индекс активного пункта: побеждает самый длинный совпавший путь.
 *
 * Простое startsWith не годится — корень роли ("/teacher") совпадает
 * с любой её страницей ("/teacher/groups"), и подсветились бы оба.
 * Возвращает -1, если не совпало ничего.
 */
export function activeIndex(items: NavItem[], path: string): number {
  let best = -1;
  let bestLength = -1;
  items.forEach((item, index) => {
    const matches = path === item.to || path.startsWith(`${item.to}/`);
    if (matches && item.to.length > bestLength) {
      bestLength = item.to.length;
      best = index;
    }
  });
  return best;
}

/**
 * Делит пункты между нижней панелью и листом «Ещё».
 *
 * В нижнюю панель телефона помещается пять целей по 44px. Пока пунктов
 * не больше пяти — показываем все. Как только больше, пятое место
 * забирает «Ещё», а под вкладки остаётся четыре.
 *
 * Раньше этого правила не было: ученику отдавали семь пунктов в панель,
 * рассчитанную на пять, и подписи сминались в нечитаемое.
 */
export function splitTabs(items: NavItem[]): { tabs: NavItem[]; rest: NavItem[] } {
  if (items.length <= MAX_TABS_WITHOUT_MORE) return { tabs: items, rest: [] };
  const preferred = items.filter((item) => item.primary);
  const tabs = (preferred.length ? preferred : items).slice(0, TABS_BESIDE_MORE);
  return { tabs, rest: items.filter((item) => !tabs.includes(item)) };
}

/**
 * Группирует пункты по section, сохраняя исходный порядок.
 *
 * Группируются только СОСЕДНИЕ пункты с одинаковым заголовком. Если один
 * раздел разбросан по списку, он честно превратится в две группы с равными
 * заголовками — это видно глазами и чинится порядком в конфиге роли,
 * а не молчаливой пересортировкой у пользователя за спиной.
 */
export function groupBySection(
  items: NavItem[],
): Array<{ section?: string; items: NavItem[] }> {
  const groups: Array<{ section?: string; items: NavItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
