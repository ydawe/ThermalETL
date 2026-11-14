import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ThermalETL — Harmonized fire hotspots",
  description:
    "One consistent MODIS + VIIRS fire history. Seasons, active years, and how now compares to usual.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
