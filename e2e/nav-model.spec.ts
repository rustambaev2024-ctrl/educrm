import { expect, test } from "@playwright/test";
import { LayoutDashboard } from "lucide-react";
import {
  activeIndex,
  groupBySection,
  splitTabs,
  MAX_TABS_WITHOUT_MORE,
  type NavItem,
} from "@/components/layouts/nav-model";

/**
 * Правила навигации каркаса. Тесты чистые — браузер не поднимается,
 * вход в систему не нужен. Это единственная часть AppShell с неочевидной
 * логикой, и проверять её через экран было бы и медленно, и ненадёжно.
 */

const icon = LayoutDashboard;
const item = (to: string, extra: Partial<NavItem> = {}): NavItem => ({
  to,
  label: to,
  icon,
  ...extra,
});

test.describe("активный пункт", () => {
  const teacher: NavItem[] = [
    item("/teacher"),
    item("/teacher/groups"),
    item("/teacher/attendance"),
  ];

  test("на корне роли активен корень", () => {
    expect(teacher[activeIndex(teacher, "/teacher")].to).toBe("/teacher");
  });

  test("на вложенной странице активна она, а не корень роли", () => {
    // Здесь ломается наивный startsWith: "/teacher/groups" начинается
    // с "/teacher", и подсветились бы оба пункта сразу.
    expect(teacher[activeIndex(teacher, "/teacher/groups")].to).toBe("/teacher/groups");
  });

  test("на под-странице активен ближайший родитель из меню", () => {
    // Страницы вроде /teacher/quiz-session/42 своего пункта не имеют.
    expect(teacher[activeIndex(teacher, "/teacher/attendance/42")].to).toBe(
      "/teacher/attendance",
    );
  });

  test("похожий, но чужой путь не считается совпадением", () => {
    // "/teacher/groupsX" не является страницей раздела "/teacher/groups",
    // хотя строка с него и начинается.
    expect(teacher[activeIndex(teacher, "/teacher/groupsX")].to).toBe("/teacher");
  });

  test("чужой раздел не подсвечивает ничего", () => {
    expect(activeIndex(teacher, "/admin/students")).toBe(-1);
  });
});

test.describe("деление на вкладки и «Ещё»", () => {
  test("пять пунктов и меньше помещаются целиком, «Ещё» не нужно", () => {
    const five = [item("/a"), item("/b"), item("/c"), item("/d"), item("/e")];
    const { tabs, rest } = splitTabs(five);
    expect(tabs).toHaveLength(MAX_TABS_WITHOUT_MORE);
    expect(rest).toHaveLength(0);
  });

  test("шесть пунктов — четыре вкладки плюс «Ещё»", () => {
    const six = ["/a", "/b", "/c", "/d", "/e", "/f"].map((to) => item(to));
    const { tabs, rest } = splitTabs(six);
    expect(tabs).toHaveLength(4);
    expect(rest).toHaveLength(2);
  });

  test("вкладки берутся из отмеченных primary, а не первых по списку", () => {
    const items = [
      item("/dash", { primary: true }),
      item("/groups"),
      item("/attendance", { primary: true }),
      item("/homework", { primary: true }),
      item("/grades", { primary: true }),
      item("/quizzes"),
      item("/coins"),
    ];
    const { tabs, rest } = splitTabs(items);
    expect(tabs.map((t) => t.to)).toEqual(["/dash", "/attendance", "/homework", "/grades"]);
    expect(rest.map((t) => t.to)).toEqual(["/groups", "/quizzes", "/coins"]);
  });

  test("вкладок никогда не больше пяти вместе с «Ещё»", () => {
    // Регрессия на реальный дефект: ученику отдавали семь пунктов в панель,
    // рассчитанную на пять, и подписи сминались в нечитаемое.
    const nine = Array.from({ length: 9 }, (_, i) => item(`/p${i}`));
    const { tabs, rest } = splitTabs(nine);
    const visible = tabs.length + (rest.length > 0 ? 1 : 0);
    expect(
      visible,
      "в нижнюю панель помещается пять целей по 44px — больше не влезает",
    ).toBeLessThanOrEqual(MAX_TABS_WITHOUT_MORE);
  });

  test("ни один пункт не теряется при делении", () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`/p${i}`));
    const { tabs, rest } = splitTabs(items);
    expect([...tabs, ...rest].map((t) => t.to).sort()).toEqual(
      items.map((t) => t.to).sort(),
    );
  });
});

test.describe("роль бухгалтера — 5 разделов", () => {
  // Зеркалит src/routes/accountant/route.tsx: пять пунктов, все primary.
  // Это ровно граничное значение MAX_TABS_WITHOUT_MORE — та же цифра, на
  // которой раньше ловили регрессию с семью пунктами у ученика (см. выше).
  const accountant: NavItem[] = [
    item("/accountant", { primary: true }),
    item("/accountant/finance", { primary: true }),
    item("/accountant/expenses", { primary: true }),
    item("/accountant/salaries", { primary: true }),
    item("/accountant/reconciliation", { primary: true }),
  ];

  test("все пять пунктов помещаются во вкладки, «Ещё» не появляется", () => {
    const { tabs, rest } = splitTabs(accountant);
    expect(tabs.map((t) => t.to)).toEqual(accountant.map((t) => t.to));
    expect(rest).toHaveLength(0);
  });

  test("на корне роли активен корень, а не «Финансы»", () => {
    // "/accountant/finance" начинается с "/accountant" — тот же наивный
    // startsWith-баг, что уже проверен для teacher выше.
    expect(accountant[activeIndex(accountant, "/accountant")].to).toBe("/accountant");
  });

  test("на «Акт сверки» активен именно этот пункт", () => {
    expect(accountant[activeIndex(accountant, "/accountant/reconciliation")].to).toBe(
      "/accountant/reconciliation",
    );
  });
});

test.describe("группировка бокового меню", () => {
  test("пункты без раздела идут первой группой без заголовка", () => {
    const groups = groupBySection([item("/dash"), item("/a", { section: "УЧЁБА" })]);
    expect(groups[0].section).toBeUndefined();
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].section).toBe("УЧЁБА");
  });

  test("соседние пункты одного раздела собираются в одну группу", () => {
    const groups = groupBySection([
      item("/a", { section: "УЧЁБА" }),
      item("/b", { section: "УЧЁБА" }),
      item("/c", { section: "ДЕНЬГИ" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
  });

  test("порядок пунктов сохраняется", () => {
    const items = [
      item("/a", { section: "S" }),
      item("/b", { section: "S" }),
      item("/c", { section: "S" }),
    ];
    expect(groupBySection(items)[0].items.map((i) => i.to)).toEqual(["/a", "/b", "/c"]);
  });
});
