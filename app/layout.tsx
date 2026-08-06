import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/PwaProvider";
import "./globals.css";

const themeInitializer = `(() => {
  try {
    const defaults = { theme: "system", fontSize: "medium", compact: false };
    const saved = JSON.parse(localStorage.getItem("helloai.preferences.v1") || "null") || defaults;
    const theme = saved.theme || defaults.theme;
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.fontSize = ["small", "medium", "large"].includes(saved.fontSize) ? saved.fontSize : defaults.fontSize;
    root.dataset.compact = saved.compact ? "true" : "false";
  } catch {}
})();`;

export const metadata: Metadata = {
  title: { default: "HelloAI", template: "%s · HelloAI" },
  description: "A local-first, no-login AI chat PWA powered by the HomePilot gateway.",
  applicationName: "HelloAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HelloAI", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializer }} /></head>
      <body><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
