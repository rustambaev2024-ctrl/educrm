import { useEffect, useState } from "react";
import { branchApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Имя платформы — оно же подпись, пока брендинг организации не загружен.
 *  Вынесено в константу, чтобы каркас мог отличить «это ещё платформа»
 *  от «это учебный центр без логотипа»: в первом случае уместен знак
 *  GrowBase, во втором — буква названия центра, иначе белый лейбл
 *  перебивался бы нашим логотипом. */
export const PLATFORM_BRAND_NAME = "GrowBase";

export interface InstitutionBrand {
  /** Название организации. До загрузки — «GrowBase». */
  name: string;
  /** Логотип организации, если загружен и отрисовался. */
  logo: string | null;
  /** Сообщить, что <img> не смог показать логотип — дальше рисуем букву. */
  onLogoError: () => void;
}

/**
 * Название и логотип организации для шапки и бокового меню.
 *
 * Вынесено в одно место намеренно. Раньше этот код был скопирован в двух
 * каркасах, и копии разошлись: в одной ошибку загрузки записывали в консоль,
 * в другой глушили пустым catch. Из-за этого клиент весь сеанс видел
 * «GrowBase» вместо названия своего центра, а причину найти было нечем.
 *
 * Брендинг не критичен для работы — при сбое экран остаётся рабочим
 * с названием по умолчанию, но молчать об этом нельзя.
 */
export function useInstitutionBrand(): InstitutionBrand {
  const { user } = useAuth();
  const [name, setName] = useState(PLATFORM_BRAND_NAME);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    // У суперадмина нет своей организации — он работает над всеми сразу.
    if (!user || user.role === "superadmin") return;

    let cancelled = false;
    branchApi
      .institutionSettings()
      .then((data) => {
        if (cancelled) return;
        if (data.name) setName(data.name);
        if (data.logo) setLogo(data.logo);
      })
      .catch((e) => console.error("Не удалось загрузить брендинг организации", e));

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { name, logo, onLogoError: () => setLogo(null) };
}
