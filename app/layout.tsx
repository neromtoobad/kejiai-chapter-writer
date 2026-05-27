import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "KejiAI — Your data. Your chapters. Under 60 seconds.",
  description:
    "Upload research data, fill a short intake form, and receive fully written, statistically interpreted academic chapters in under 60 seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Plausible analytics is enabled when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set
  // (e.g. "kejiai.app"). Custom Plausible script host is optional via
  // NEXT_PUBLIC_PLAUSIBLE_SCRIPT (defaults to plausible.io).
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const plausibleSrc =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT ??
    "https://plausible.io/js/script.js";

  return (
    <html
      lang="en"
      className={cn(inter.variable, playfair.variable, geistMono.variable)}
    >
      <head>
        {plausibleDomain ? (
          <Script
            defer
            data-domain={plausibleDomain}
            src={plausibleSrc}
            strategy="afterInteractive"
          />
        ) : null}
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
