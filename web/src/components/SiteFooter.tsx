import Link from "next/link";
import { ATTRIBUTION } from "@/lib/config";

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-white/60 px-4 py-4 text-xs text-ink-soft sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{ATTRIBUTION}</p>
        <p className="flex gap-4">
          <span>Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors</span>
          <Link href="/how-it-works/" className="underline underline-offset-2 hover:text-ink">
            How it works
          </Link>
        </p>
      </div>
    </footer>
  );
}
