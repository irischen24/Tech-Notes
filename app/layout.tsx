import type { Metadata, Viewport } from "next";
import "@fontsource-variable/roboto";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "Iris Notes",
    template: "%s｜Iris Notes",
  },
  description: "Iris 的個人技術筆記與知識管理系統：資料庫、Linux、程式設計、AI 與資安。",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffbfe" },
    { media: "(prefers-color-scheme: dark)", color: "#141218" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme 由內嵌腳本在繪製前設定，因此 <html> 屬性與 SSR 不同屬預期
    <html lang="zh-Hant-TW" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          跳到主要內容
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
