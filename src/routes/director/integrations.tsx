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
import { Settings, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/director/integrations")({
  component: DirectorIntegrationsPage,
});

function DirectorIntegrationsPage() {
  const { t } = useI18n();
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const res = await branchApi.metaSettings();
        setPixelId(res.meta_pixel_id || "");
        setAccessToken(res.meta_access_token ? "••••••••••••••••" : "");
      } catch (err) {
        console.error("Failed to load integrations", err);
        toast.error("Не удалось загрузить настройки интеграции");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: { meta_pixel_id?: string; meta_access_token?: string } = {
        meta_pixel_id: pixelId,
      };
      // Only send access token if it's not the mask we populated
      if (accessToken && accessToken !== "••••••••••••••••") {
        payload.meta_access_token = accessToken;
      }
      await branchApi.updateMetaSettings(payload);
      toast.success("Настройки интеграции успешно сохранены!");
    } catch (err) {
      console.error("Failed to save integrations", err);
      toast.error("Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Integratsiyalar"
        description="Facebook Conversions API va Pixel sozlamalari"
      />
      <div className="max-w-2xl p-4 md:p-8 space-y-6">
        <Card className="p-6 border border-border/60 shadow-elegant">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/60">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Settings className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Meta Conversions API & Pixel</h3>
              <p className="text-sm text-muted-foreground">
                Tizimda yangi o'quvchi ro'yxatdan o'tganda (yoki murojaat o'quvchiga aylanganda) Meta (Facebook) CAPI orqali Purchase hodisasini avtomatik yuborish.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pixel-id" className="text-sm font-medium text-foreground">
                  Meta Pixel ID
                </Label>
                <Input
                  id="pixel-id"
                  placeholder="Masalan: 123456789012345"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  className="bg-background border-border/60"
                />
                <p className="text-xs text-muted-foreground">
                  Sizning Meta reklamangiz uchun ishlatiladigan asosiy Pixel ID.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-token" className="text-sm font-medium text-foreground">
                  Meta Access Token (Conversions API)
                </Label>
                <Input
                  id="access-token"
                  type="password"
                  placeholder="EAABw..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="bg-background border-border/60"
                />
                <p className="text-xs text-muted-foreground">
                  Facebook Events Manager orqali olingan CAPI tizim tokeni.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-gradient-primary text-primary-foreground shadow-elegant px-6"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saqlanmoqda...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 size-4" />
                      Saqlash
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
