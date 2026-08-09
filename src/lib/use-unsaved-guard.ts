import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Защита от потери заполненной формы.
 *
 * Два разных случая, и они закрываются по-разному:
 *
 * 1. Закрытие вкладки или перезагрузка — перехватывает браузер через
 *    `beforeunload`. Текст диалога задаёт сам браузер, свой подставить
 *    нельзя: так сделано во всех движках намеренно, чтобы страницы
 *    не пугали пользователя выдуманными сообщениями.
 *
 * 2. Закрытие панели или диалога — браузер здесь ни при чём, спрашиваем
 *    сами. Хук держит только состояние; сам диалог рисует вызывающий
 *    через `ConfirmDialog` — `window.confirm` в этом проекте запрещён
 *    (см. CLAUDE.md), и хук не исключение.
 *
 * В проекте было три места с какой-либо защитой на десятки форм: случайно
 * закрытая панель создания ученика стирала всё заполненное без вопроса.
 */
export function useUnsavedGuard(isDirty: boolean) {
  const [askOpen, setAskOpen] = useState(false);
  const pendingClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Значение игнорируется современными браузерами, но присвоение всё
      // ещё требуется части движков, чтобы диалог вообще показался.
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  /**
   * Обёртка вокруг закрытия. Если форма не тронута — закрывает сразу,
   * иначе откладывает и поднимает флаг для диалога.
   */
  const requestClose = useCallback(
    (close: () => void) => {
      if (!isDirty) {
        close();
        return;
      }
      pendingClose.current = close;
      setAskOpen(true);
    },
    [isDirty],
  );

  /** Пользователь подтвердил, что данные можно потерять. */
  const discard = useCallback(() => {
    setAskOpen(false);
    const close = pendingClose.current;
    pendingClose.current = null;
    close?.();
  }, []);

  return { askOpen, setAskOpen, requestClose, discard };
}
