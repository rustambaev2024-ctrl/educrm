import { useEffect, useState } from "react";
import { branchApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export interface InstitutionBrand {
  /** Название организации. До загрузки — «EduCRM». */
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
 * «EduCRM» вместо названия своего центра, а причину найти было нечем.
 *
 * Брендинг не критичен для работы — при сбое экран остаётся рабочим
 * с названием по умолчанию, но молчать об этом нельзя.
 */
export function useInstitutionBrand(): InstitutionBrand {
  const { user } = useAuth();
  const [name, setName] = useState("EduCRM");
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
