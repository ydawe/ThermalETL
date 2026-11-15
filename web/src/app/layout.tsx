import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThermalETL: Harmonized fire hotspots",
  description:
    "One consistent MODIS + VIIRS fire history. Seasons, active years, and how now compares to usual.",
};

export const viewport: Viewport = {
  themeColor: "#eef3f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-screen flex-col font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
