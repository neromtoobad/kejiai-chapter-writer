/**
 * Server-side Sentry init (Node runtime). Only activates when
 * SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is present.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}
