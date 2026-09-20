import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);
/* Ключ не переименован вместе с брендом намеренно: у живых пользователей
   в нём уже лежит выбор, и смена имени молча сбросила бы его. Это отдельная
   миграция, а не замена строки. */
const KEY = "educrm.theme";

/**
 * Первая отрисовка обязана совпасть с тем, что уже выставил блокирующий
 * скрипт в <head> (см. __root.tsx). Если стартовать с "light", когда в
 * хранилище лежит "dark", React на гидратации снял бы класс и страница
 * мигнула бы белым. Поэтому начальное значение читается синхронно из
 * самого документа, а не из localStorage.
 */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Светлая тема — главная, тёмная — полноценная опция.
 *
 * До 2026-09-20 тема была захардкожена в "light", а toggle был заглушкой:
 * блок `.dark` в styles.css удалили как мёртвый код, и переключать было
 * нечего. Теперь тема настоящая, поэтому провайдер снова хранит выбор.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Приватное окно или запрещённые данные сайта: тема останется
      // выбранной до перезагрузки, а не уронит страницу.
    }
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
