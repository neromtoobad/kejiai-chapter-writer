/** @type {import('next').NextConfig} */
const nextConfig = {};

// Sentry is enabled when both a DSN and an auth token are configured.
// In other environments the build keeps this file effectively no-op so
// local dev and unsentried deploys don't need extra setup.
const sentryDsn =
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

let exported = nextConfig;
if (sentryDsn) {
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
    exported = withSentryConfig(nextConfig, {
      silent: true,
      authToken: sentryAuthToken,
      // Upload source maps only if the auth token is present.
      sourcemaps: { disable: !sentryAuthToken },
    });
  } catch {
    // @sentry/nextjs not installed yet, or import failed — fall back.
  }
}

export default exported;
