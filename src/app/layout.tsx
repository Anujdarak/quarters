import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/shell";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import { isDemo } from "@/lib/env";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Quarters: Indian Earnings Intelligence", template: "%s · Quarters" },
  description:
    "Research Indian listed companies (NSE, BSE, mainboard and SME) around their quarterly results: historical results, announcement dates and market reactions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" data-theme="dark" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppShell demo={isDemo()}>{children}</AppShell>
      </body>
    </html>
  );
}
