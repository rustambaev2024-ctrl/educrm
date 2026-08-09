import { useEffect, useState } from "react";

/**
 * Отложенное значение — для полей поиска.
 *
 * Один и тот же код был написан вручную в двух местах
 * (`routes/admin/students.tsx`, `components/edu/nazorat-page.tsx`),
 * в остальных десяти поиск пересчитывал фильтр на каждое нажатие клавиши.
 *
 * Где это заметно:
 * - поиск, который ходит в API (ученики, «Контроль») — иначе на каждую
 *   букву уходит запрос;
 * - фильтрация большого массива в памяти на телефоне: 400 учеников
 *   пересчитываются быстро, но не мгновенно, и ввод начинает дёргаться.
 *
 * 400 мс — то значение, что уже было подобрано в students.tsx; менять
 * его без замера незачем.
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
