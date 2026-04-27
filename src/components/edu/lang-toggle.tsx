import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.toggle")}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-card/60 p-0.5 backdrop-blur-sm"
    >
      <Button
        type="button"
        variant={lang === "uz" ? "default" : "ghost"}
        size="sm"
        onClick={() => setLang("uz")}
        className={`h-8 px-3 text-xs font-semibold ${lang === "uz" ? "" : "text-muted-foreground hover:text-foreground"}`}
        aria-pressed={lang === "uz"}
      >
        UZ
      </Button>
      <Button
        type="button"
        variant={lang === "ru" ? "default" : "ghost"}
        size="sm"
        onClick={() => setLang("ru")}
        className={`h-8 px-3 text-xs font-semibold ${lang === "ru" ? "" : "text-muted-foreground hover:text-foreground"}`}
        aria-pressed={lang === "ru"}
      >
        RU
      </Button>
    </div>
  );
}