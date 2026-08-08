import * as Sentry from "@sentry/react";

/**
 * Inert unless VITE_SENTRY_DSN is set — no Sentry account is wired up yet.
 * Turning this on is a one-env-var change (VITE_SENTRY_DSN), not a deploy.
 * Client-only: guarded so it never runs during SSR.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || typeof window === "undefined") return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || (import.meta.env.DEV ? "development" : "production"),
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
  });
}
