import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { TriangleAlert } from "lucide-react";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { DataStoreProvider } from "@/lib/data/store";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initSentry } from "@/lib/sentry";

initSentry();

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="text-7xl font-bold bg-gradient-primary bg-clip-text text-transparent">404</div>
        <h2 className="mt-4 text-xl font-semibold">{t("notFound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFound.body")}</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">{t("notFound.home")}</Link>
      </div>
    </div>
  );
}

/**
 * Единственная сетка безопасности на случай, когда компонент падает при
 * отрисовке. До этого errorComponent не было нигде: необработанная ошибка
 * рендера давала пустой белый экран, а поскольку Sentry inert без DSN,
 * о ней никто и не узнавал.
 *
 * Хуки здесь использовать нельзя: errorComponent подставляется ВМЕСТО
 * component корневого роута, поэтому провайдеров i18n, авторизации и стора
 * внутри него не существует. Язык читаем из того же ключа localStorage,
 * что и блокирующий скрипт в <head>.
 */
function RootErrorComponent({ error }: { error: Error }) {
  Sentry.captureException(error);

  let uz = true;
  try {
    uz = localStorage.getItem("educrm.lang") !== "ru";
  } catch {
    // localStorage недоступен — остаёмся на узбекском по умолчанию
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </div>
        <h2 className="text-lg font-medium text-foreground">
          {uz ? "Sahifa ochilmadi" : "Страница не открылась"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {uz
            ? "Xatolik yozib olindi. Sahifani qayta yuklab ko'ring — ma'lumotlaringiz joyida."
            : "Ошибка записана. Попробуйте перезагрузить страницу — ваши данные на месте."}
        </p>
        {import.meta.env.DEV && (
          <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-left text-[11px] text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {uz ? "Qayta yuklash" : "Перезагрузить"}
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {uz ? "Boshiga" : "На главную"}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Цвет системной панели браузера. Совпадает с --sidebar: на телефоне
      // адресная строка красится в него, и она должна быть частью продукта,
      // а не остатком прежнего синего бренда.
      { name: "theme-color", content: "#0a3527" },
      { title: "EduCRM — Платформа управления образовательными центрами" },
      { name: "description", content: "Управление учениками, группами, расписанием, финансами и аналитикой образовательного центра в одной системе." },
      { property: "og:title", content: "EduCRM — Управление учебным центром" },
      { property: "og:description", content: "Современная SaaS-платформа для образовательных центров." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "EduCRM — Управление учебным центром" },
      { name: "twitter:description", content: "Современная SaaS-платформа для образовательных центров." },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "EduCRM" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.remove('dark');var l=localStorage.getItem('educrm.lang');document.documentElement.lang=(l==='ru'?'ru':'uz');}catch(e){}`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "EduCRM",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "SaaS-платформа для управления образовательными центрами: ученики, группы, расписание, финансы, аналитика.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "UZS" },
            }),
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <DataStoreProvider>
            <TooltipProvider delayDuration={300}>
              <Outlet />
            </TooltipProvider>
            <Toaster />
          </DataStoreProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
