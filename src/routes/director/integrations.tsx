import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/edu/page-header";
import { branchApi } from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Settings, Check, Loader2, Link2, Info, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/director/integrations")({
  component: DirectorIntegrationsPage,
});

function DirectorIntegrationsPage() {
  const { lang } = useI18n();
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const t = labels(lang);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const res = await branchApi.metaSettings();
        setPixelId(res.meta_pixel_id || "");
        setAccessToken(res.meta_access_token ? "••••••••••••••••" : "");
      } catch (err) {
        console.error("Failed to load integrations", err);
        toast.error(t.loadError);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchSettings();
  }, [lang]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: { meta_pixel_id?: string; meta_access_token?: string } = {
        meta_pixel_id: pixelId.trim(),
      };
      // Only send access token if it's not the mask we populated
      if (accessToken && accessToken !== "••••••••••••••••") {
        payload.meta_access_token = accessToken.trim();
      }
      await branchApi.updateMetaSettings(payload);
      toast.success(t.saveSuccess);
    } catch (err) {
      console.error("Failed to save integrations", err);
      toast.error(t.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.subtitle}
      />
      <div className="max-w-4xl p-4 md:p-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main settings form */}
          <div className="md:col-span-2 space-y-6">
            <Card className="p-6 border border-border/60 shadow-elegant bg-card/60 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/60">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                  <Settings className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">{t.cardTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.cardSubtitle}</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pixel-id" className="text-sm font-medium text-foreground">
                        {t.pixelIdLabel}
                      </Label>
                    </div>
                    <Input
                      id="pixel-id"
                      placeholder={t.pixelIdPlaceholder}
                      value={pixelId}
                      onChange={(e) => setPixelId(e.target.value)}
                      className="bg-background border-border/60 focus:border-primary/50 transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t.pixelIdHint}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="access-token" className="text-sm font-medium text-foreground">
                      {t.accessTokenLabel}
                    </Label>
                    <Input
                      id="access-token"
                      type="password"
                      placeholder={t.accessTokenPlaceholder}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="bg-background border-border/60 focus:border-primary/50 transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t.accessTokenHint}
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="bg-gradient-primary text-primary-foreground shadow-elegant px-6 min-w-[140px]"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          {t.savingButton}
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 size-4" />
                          {t.saveButton}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>

          {/* Guidelines Sidebar */}
          <div className="space-y-6">
            <Card className="p-5 border border-border/60 shadow-elegant bg-primary/5 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-3 text-primary">
                <Info className="size-4" />
                <h4 className="font-semibold text-sm">{t.helpTitle}</h4>
              </div>
              <ul className="text-xs space-y-3.5 text-muted-foreground">
                <li className="leading-relaxed">
                  <strong className="text-foreground block mb-0.5">1. Meta Pixel ID</strong>
                  {t.helpStep1}
                </li>
                <li className="leading-relaxed">
                  <strong className="text-foreground block mb-0.5">2. Conversions API (CAPI)</strong>
                  {t.helpStep2}
                </li>
                <li className="leading-relaxed">
                  <strong className="text-foreground block mb-0.5">3. {t.helpLeadTrackingTitle}</strong>
                  {t.helpLeadTrackingBody}
                </li>
              </ul>
              <div className="mt-5 pt-4 border-t border-border/40">
                <a
                  href="https://business.facebook.com/events_manager"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline transition-all"
                >
                  Meta Events Manager
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function labels(lang: "uz" | "ru") {
  if (lang === "ru") {
    return {
      title: "Интеграции",
      subtitle: "Настройка сторонних сервисов и рекламных систем",
      cardTitle: "Meta (Facebook) Conversions API & Pixel",
      cardSubtitle: "Настройка сквозной аналитики и отслеживания рекламных кампаний",
      pixelIdLabel: "Meta Pixel ID",
      pixelIdPlaceholder: "Например: 123456789012345",
      pixelIdHint: "Уникальный числовой идентификатор вашего пикселя Meta. Позволяет связывать действия пользователей на сайте.",
      accessTokenLabel: "Маркер доступа Meta Conversions API (System Token)",
      accessTokenPlaceholder: "Начинается с EAABw...",
      accessTokenHint: "Токен доступа, сгенерированный в Events Manager. Позволяет отправлять события с сервера (Conversions API) в обход блокировщиков рекламы.",
      saveButton: "Сохранить",
      savingButton: "Сохранение...",
      loadError: "Не удалось загрузить настройки интеграции",
      saveSuccess: "Настройки интеграции успешно сохранены!",
      saveError: "Не удалось сохранить настройки",
      helpTitle: "Как это работает?",
      helpStep1: "Найдите ID вашего пикселя в панели Meta Events Manager во вкладке «Настройки».",
      helpStep2: "В Events Manager перейдите в «Настройки» -> прокрутите до «Conversions API» -> нажмите «Сгенерировать маркер доступа» и вставьте его сюда.",
      helpStep3: "Маркетинговые события",
      helpLeadTrackingTitle: "Отслеживание лидов",
      helpLeadTrackingBody: "При переводе лида в статус «Won» (Записался) система автоматически посылает событие «Purchase» (Покупка) обратно в Meta, чтобы оптимизировать рекламу.",
    };
  }
  return {
    title: "Integratsiyalar",
    subtitle: "Tashqi xizmatlar va reklama tizimlarini sozlash",
    cardTitle: "Meta (Facebook) Conversions API & Pixel",
    cardSubtitle: "Reklama kampaniyalarini va konversiyalarni kuzatish tizimini sozlash",
    pixelIdLabel: "Meta Pixel ID",
    pixelIdPlaceholder: "Masalan: 123456789012345",
    pixelIdHint: "Meta reklama hisobingiz uchun asosiy Pixel ID raqami. O'quvchilar faolligini reklama kampaniyasi bilan bog'laydi.",
    accessTokenLabel: "Meta Conversions API kirish tokeni (System Token)",
    accessTokenPlaceholder: "EAABw... bilan boshlanadi",
    accessTokenHint: "Meta Events Manager bo'limidan olingan maxsus token. Server orqali (Conversions API) brauzer cheklovlarisiz ma'lumot uzatish imkonini beradi.",
    saveButton: "Saqlash",
    savingButton: "Saqlanmoqda...",
    loadError: "Integratsiya sozlamalarini yuklab bo'lmadi",
    saveSuccess: "Integratsiya sozlamalari muvaffaqiyatli saqlandi!",
    saveError: "Sozlamalarni saqlashda xatolik yuz berdi",
    helpTitle: "Qanday ishlaydi?",
    helpStep1: "Meta Events Manager panelida «Sozlamalar» (Settings) bo'limidan o'z Pixel ID raqamingizni toping.",
    helpStep2: "Events Manager-dan «Sozlamalar» -> «Conversions API» bo'limiga tushing -> «Kirish tokenini yaratish» (Generate access token) tugmasini bosing va uni bu yerga joylang.",
    helpStep3: "Marketing hodisalari",
    helpLeadTrackingTitle: "Murojaatlarni kuzatish",
    helpLeadTrackingBody: "Murojaat statusi «Won» (Yozildi) holatiga o'tishi bilan tizim avtomatik ravishda Meta serveriga «Purchase» (Xarid) hodisasini yuboradi. Bu reklama samaradorligini oshiradi.",
  };
}

