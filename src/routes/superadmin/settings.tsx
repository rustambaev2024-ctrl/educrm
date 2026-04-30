import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Save, Settings as SettingsIcon, ShieldCheck, Palette } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/superadmin/settings")({ component: SaSettings });

function SaSettings() {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  const [platformName, setPlatformName] = useState("EduCRM");
  const [supportEmail, setSupportEmail] = useState("support@educrm.uz");
  const [supportPhone, setSupportPhone] = useState("+998 71 200 00 00");
  const [defaultLang, setDefaultLang] = useState("uz");
  const [defaultTheme, setDefaultTheme] = useState("system");

  const [twoFactor, setTwoFactor] = useState(true);
  const [strongPwd, setStrongPwd] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);

  const [primaryColor, setPrimaryColor] = useState("#3B82F6");

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(t("sa.settings.saved"));
    }, 400);
  };

  return (
    <>
      <PageHeader
        title={t("sa.settings.title")}
        description={t("sa.settings.subtitle")}
        actions={
          <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground shadow-elegant">
            <Save className="mr-1 size-4" /> {t("common.save")}
          </Button>
        }
      />
      <div className="p-4 md:p-8">
        <Tabs defaultValue="general">
          <TabsList className="mb-6">
            <TabsTrigger value="general"><SettingsIcon className="mr-1 size-3.5" />{t("sa.settings.general")}</TabsTrigger>
            <TabsTrigger value="security"><ShieldCheck className="mr-1 size-3.5" />{t("sa.settings.security")}</TabsTrigger>
            <TabsTrigger value="brand"><Palette className="mr-1 size-3.5" />{t("sa.settings.brand")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card className="space-y-5 p-6 shadow-elegant">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("sa.settings.platformName")}>
                  <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} />
                </Field>
                <Field label={t("sa.settings.supportEmail")}>
                  <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
                </Field>
                <Field label={t("sa.settings.supportPhone")}>
                  <Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
                </Field>
                <Field label={t("sa.settings.defaultLang")}>
                  <Select value={defaultLang} onValueChange={setDefaultLang}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uz">O'zbekcha (Latin)</SelectItem>
                      <SelectItem value="ru">Русский</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("sa.settings.theme")}>
                  <Select value={defaultTheme} onValueChange={setDefaultTheme}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="space-y-5 p-6 shadow-elegant">
              <Toggle label={t("sa.settings.twoFactor")} checked={twoFactor} onChange={setTwoFactor} />
              <Toggle label={t("sa.settings.passwordPolicy")} checked={strongPwd} onChange={setStrongPwd} />
              <Field label={t("sa.settings.sessionTimeout")}>
                <Input type="number" min={5} max={480} value={sessionTimeout} onChange={(e) => setSessionTimeout(Number(e.target.value))} className="max-w-xs" />
              </Field>
            </Card>
          </TabsContent>

          <TabsContent value="brand">
            <Card className="space-y-5 p-6 shadow-elegant">
              <Field label="Primary color">
                <div className="flex items-center gap-3">
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-16 cursor-pointer rounded-md border border-border bg-transparent" />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="max-w-xs" />
                </div>
              </Field>
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Preview</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl text-primary-foreground" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}>
                    <Palette className="size-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">{platformName}</div>
                    <div className="text-xs text-muted-foreground">Brand preview</div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
