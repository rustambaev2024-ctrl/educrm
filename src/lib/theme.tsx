import { createContext, useContext, useEffect, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);
const KEY = "educrm.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Продукт поддерживает только светлую тему (док. 6.2). Тёмная тема отключена.
  const theme: Theme = "light";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("dark");
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(KEY, "light");
        localStorage.removeItem("theme");
      } catch {
        // ignore
      }
    }
  }, []);

  // toggle сохранён как no-op для обратной совместимости со старым кодом.
  return <ThemeContext.Provider value={{ theme, toggle: () => {} }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
