import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, GraduationCap, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LangToggle } from "@/components/edu/lang-toggle";
import { PasswordInput } from "@/components/edu/password-input";
import { PhoneInput } from "@/components/edu/phone-input";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { ROLE_HOMES } from "@/lib/roles";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({ component: LoginPage });

export function LoginPage() {
  const { user, login, isHydrating } = useAuth();
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isHydrating && user) {
      navigate({ to: ROLE_HOMES[user.role] });
    }
  }, [user, isHydrating, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim() || !password.trim()) {
      toast.error(t("toast.fillFields"));
      return;
    }

    try {
      setIsSubmitting(true);
      await login(phone.trim(), password.trim());
      toast.success(t("toast.welcome"));
    } catch (error) {
      const message =
        error instanceof Error && error.message !== "API 401"
          ? error.message
          : "Telefon raqam yoki parol noto'g'ri";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <LangToggle />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme.toggle")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-12 lg:flex-row lg:gap-16 lg:px-8">
        <div className="mb-10 flex-1 lg:mb-0">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <GraduationCap className="size-6 text-primary-foreground" />
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight">EduCRM</div>
              <div className="text-xs text-muted-foreground">{t("brand.tagline")}</div>
            </div>
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            {t("login.heroPrefix")} <span className="text-primary">{t("login.heroAccent")}</span>
          </h1>
          <p className="mt-4 max-w-lg text-balance text-base text-muted-foreground md:text-lg">{t("login.subtitle")}</p>
        </div>

        <div className="w-full max-w-md flex-shrink-0">
          <Card className="border-border/60 bg-card/80 p-6 shadow-elegant-lg backdrop-blur-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
                <GraduationCap className="size-5 text-primary-foreground" />
              </div>
              <div>
                <div className="text-base font-semibold">{t("login.signInAs")}</div>
                <div className="text-xs text-muted-foreground">EduCRM</div>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t("login.phone")}</Label>
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                    aria-label={t("login.remember")}
                    disabled={isSubmitting}
                  />
                  <span>{t("login.remember")}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  {t("login.forgot")}
                </button>
              </div>
              <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95" disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("login.submit")} {!isSubmitting && <ArrowRight className="ml-1 size-4" />}
              </Button>
            </form>
          </Card>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("login.forgotTitle")}</DialogTitle>
            <DialogDescription>{t("login.forgotBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setForgotOpen(false)}>{t("login.back")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
