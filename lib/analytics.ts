/**
 * KejiAI — Plausible event helper.
 *
 * Fires custom events when Plausible is loaded; no-op otherwise. Use to
 * track funnel steps (file_parsed, generation_started, chapter_exported,
 * etc.) without coupling components to the Plausible global.
 */

interface PlausibleProps {
  [key: string]: string | number | boolean | undefined;
}

type PlausibleFn = (event: string, opts?: { props?: PlausibleProps }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

export function trackEvent(name: string, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  const fn = window.plausible;
  if (typeof fn === "function") {
    try {
      fn(name, props ? { props } : undefined);
    } catch {
      // analytics errors must never break user flow
    }
  }
}
