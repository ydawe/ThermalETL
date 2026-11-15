import Image from "next/image";
import Link from "next/link";

export default function SiteHeader({ hero = false }: { hero?: boolean }) {
  return (
    <header className={`px-4 sm:px-6 ${hero ? "pb-3 pt-4 lg:min-h-[7.5rem]" : "py-4"}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <Link
            href="/"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tide"
            aria-label="ThermalETL home"
          >
            <Image
              src="/brand/thermaletl-logo.png"
              alt="ThermalETL"
              width={hero ? 280 : 180}
              height={hero ? 92 : 59}
              priority
              className={`h-auto w-auto ${hero ? "max-h-[4.5rem] sm:max-h-[5.5rem]" : "max-h-10"}`}
            />
          </Link>
          {hero && (
            <p className="max-w-md animate-rise pb-1 text-base leading-snug text-ink-soft [animation-delay:120ms] sm:text-lg">
              Two satellites, one fire history. See when an area usually burns, and whether now is unusual.
            </p>
          )}
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1 pb-1 text-sm">
          <Link href="/?region=world" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            World
          </Link>
          <Link href="/?region=poland" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Poland
          </Link>
          <Link href="/how-it-works/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
