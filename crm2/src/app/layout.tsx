import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/hooks/use-theme";
import { ThemedToaster } from "@/components/themed-toaster";
import { PwaBoot } from "@/components/pwa/pwa-boot";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  MODES,
  STORAGE_KEY,
  THEME_IDS,
} from "@/lib/themes";

// The variable is NOT `--font-sans`. `next/font` only emits the
// declaration that feeds it from a separate production stylesheet, so a
// deployment that serves the HTML but misses that chunk leaves
// `--font-sans` empty and the whole app falls back to the browser
// default serif — which is exactly the difference `next dev` hides,
// because dev injects the same declaration inline. Keeping the font's
// own variable under its own name lets `globals.css` give the
// `--font-sans` token a real stack to fall back to, so a missing chunk
// (stale CDN copy, a standalone image built without `.next/static`, a
// blocked request) degrades to the platform UI font instead.
//
// The `inter_...__variable` class only sets a custom property, so it
// cannot fight the token. The `__className` variant is deliberately not
// applied: it sets `font-family` outright, in an unlayered rule that
// outranks any `@layer` override, which would put the guarantee back in
// the hands of the chunk.
const inter = Inter({
  variable: "--app-font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Tzmicha CRM",
  title: {
    default: "WhatsApp CRM | Manage Leads, Conversations & Sales | TZMICHA IT SOLUTIONS",
    template: "%s | TZMICHA IT SOLUTIONS",
  },
  description:
    "Manage WhatsApp conversations, leads, campaigns, automation and customer relationships from one powerful CRM. Connect Facebook, Instagram and WhatsApp in a single platform.",
  keywords: [
    "WhatsApp CRM",
    "CRM software",
    "lead management",
    "WhatsApp Business",
    "customer management",
    "sales automation",
    "campaign management",
    "FB leads",
    "Instagram leads",
  ],
  openGraph: {
    title: "WhatsApp CRM | TZMICHA IT SOLUTIONS",
    description:
      "Turn conversations into customers. Manage WhatsApp, leads, campaigns and automation from one powerful CRM.",
    type: "website",
    locale: "en_US",
    siteName: "TZMICHA IT SOLUTIONS",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp CRM | TZMICHA IT SOLUTIONS",
    description:
      "Turn conversations into customers. Manage WhatsApp, leads, campaigns and automation from one powerful CRM.",
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/icon" },
      { url: "/icons/icon-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tzmicha CRM",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark light",
};

// Inline boot script — runs before React hydrates so the user's
// chosen accent (data-theme) AND mode (data-mode) are on the <html>
// element before first paint. Without this every page load flashes
// the server-rendered defaults for a frame before the React tree
// mounts and applies the picked values.
//
// Kept dependency-free (no imports, no JSX) — must be a string the
// browser can run as a single <script>. Knowledge of valid ids is
// sourced from the THEME_IDS / MODES constants so adding one doesn't
// silently break the boot path.
const THEME_BOOT_SCRIPT = `
(function(){
  var d = document.documentElement;
  try {
    var THEME_KEY = ${JSON.stringify(STORAGE_KEY)};
    var THEME_DEFAULT = ${JSON.stringify(DEFAULT_THEME)};
    var THEMES = ${JSON.stringify(THEME_IDS)};
    var savedTheme = localStorage.getItem(THEME_KEY);
    d.dataset.theme = THEMES.indexOf(savedTheme) !== -1 ? savedTheme : THEME_DEFAULT;

    var MODE_KEY = ${JSON.stringify(MODE_STORAGE_KEY)};
    var MODE_DEFAULT = ${JSON.stringify(DEFAULT_MODE)};
    var MODES = ${JSON.stringify(MODES)};
    var savedMode = localStorage.getItem(MODE_KEY);
    // "auto" is a *preference*, not a paintable mode: there is no
    // [data-mode="auto"] rule in globals.css, and the bare :root
    // fallback is the dark token set. Writing the literal "auto" here
    // therefore fell through to :root and made Auto render DARK on
    // every reload regardless of the OS setting (the provider's
    // applyMode() resolved it correctly, but only after hydration, and
    // nothing re-applied it on mount). Resolve it to a concrete
    // light/dark here, in the boot script, so the first paint is right.
    if (MODES.indexOf(savedMode) === -1) {
      savedMode = MODE_DEFAULT;
    }
    if (savedMode === 'auto') {
      savedMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    d.dataset.mode = savedMode;
  } catch (_e) {
    d.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
    d.dataset.mode = ${JSON.stringify(DEFAULT_MODE)};
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      data-mode={DEFAULT_MODE}
      className={`${inter.variable} h-full antialiased`}
      // The `theme-boot` script below rewrites `data-theme` and
      // `data-mode` on <html> from localStorage before React hydrates,
      // so for any non-default choice the client DOM intentionally
      // differs from the server-rendered defaults. suppressHydration-
      // Warning silences the expected mismatch — it only applies to
      // this element's own attributes, so genuine mismatches in
      // children still surface.
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            {children}
            <ThemedToaster />
            <PwaBoot />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
