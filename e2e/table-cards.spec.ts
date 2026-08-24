import { expect, test } from "@playwright/test";

/**
 * Таблица → карточки на телефоне (столп 8).
 *
 * Все таблицы продукта живут за авторизацией, поэтому открыть их в тесте
 * без тестового аккаунта нельзя. Но рискованная часть здесь — не данные,
 * а сам CSS-механизм: превращается ли строка в карточку и перестаёт ли
 * таблица уезжать вбок. Это проверяется на представительной разметке,
 * собранной теми же компонентами (обёртка `.edu-scroll-x`, таблица
 * `.edu-cards`), без входа в систему.
 *
 * Проверка идёт в обоих профилях: на Pixel 7 ждём карточки, на десктопе —
 * что таблица осталась таблицей и ничего не сломалось.
 */

const TABLE_HTML = `
<div id="probe" style="width:100%">
  <div class="edu-scroll-x relative w-full overflow-auto">
    <table class="edu-cards w-full caption-bottom text-sm">
      <thead><tr>
        <th>Ученик</th><th>Группы</th><th>Баланс</th><th>Статус</th><th>Действия</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>Азиза Каримова +998 90 123-45-67</td>
          <td>Английский B2</td>
          <td>-840 000</td>
          <td>Должник</td>
          <td><button>Открыть</button></td>
        </tr>
        <tr>
          <td>Дониёр Рахимов +998 91 234-56-78</td>
          <td>Математика A1</td>
          <td>-620 000</td>
          <td>Должник</td>
          <td><button>Открыть</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;

async function mount(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate((html) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:100%;z-index:99999";
    // Разметка статическая, задана в тесте, а не получена извне.
    host.innerHTML = html;
    document.body.appendChild(host);
  }, TABLE_HTML);
}

test("на телефоне строка таблицы становится карточкой", async ({ page }, testInfo) => {
  await mount(page);

  const result = await page.evaluate(() => {
    const table = document.querySelector("table.edu-cards") as HTMLElement;
    const wrap = table.parentElement as HTMLElement;
    const firstRow = table.querySelector("tbody tr") as HTMLElement;
    const head = table.querySelector("thead") as HTMLElement;
    return {
      narrow: window.matchMedia("(max-width: 767px)").matches,
      rowDisplay: getComputedStyle(firstRow).display,
      headDisplay: getComputedStyle(head).display,
      // Уезжает ли содержимое за край контейнера
      overflow: wrap.scrollWidth - wrap.clientWidth,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(
      result.narrow,
      'профиль "mobile" обязан попадать в max-width: 767px — иначе проверка карточек ничего не проверяет',
    ).toBe(true);
  }

  if (result.narrow) {
    expect(result.rowDisplay, "строка на телефоне должна стать карточкой (flex), а не table-row").toBe("flex");
    expect(result.headDisplay, "шапка таблицы на телефоне не нужна: подписи уходят в карточку").toBe("none");
    expect(
      result.overflow,
      "карточки не должны уезжать за край контейнера — если уезжают, проекция не сработала",
    ).toBe(0);
  } else {
    expect(result.rowDisplay, "на десктопе таблица обязана остаться таблицей").toBe("table-row");
    expect(result.headDisplay).not.toBe("none");
  }

  expect(
    result.docOverflow,
    "страница не должна получать горизонтальную прокрутку из-за таблицы",
  ).toBeLessThanOrEqual(0);
});
