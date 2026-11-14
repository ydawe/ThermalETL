import Link from "next/link";

export default function SiteHeader({ hero = false }: { hero?: boolean }) {
  return (
    <header className={`px-4 sm:px-6 ${hero ? "pb-3 pt-4 lg:h-[7.5rem]" : "py-4"}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <Link href="/" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tide">
            {hero ? (
              <h1 className="wordmark animate-rise font-display text-5xl font-semibold leading-none text-ink sm:text-6xl lg:text-7xl">
                Thermal<span className="wordmark-accent">ETL</span>
              </h1>
            ) : (
              <span className="wordmark font-display text-3xl font-semibold leading-none text-ink">
                Thermal<span className="wordmark-accent">ETL</span>
              </span>
            )}
          </Link>
          {hero && (
            <p className="max-w-md animate-rise pb-1 text-base leading-snug text-ink-soft [animation-delay:120ms] sm:text-lg">
              Two satellites, one fire history. See when an area usually burns — and whether now is unusual.
            </p>
          )}
        </div>
        <nav aria-label="Main" className="flex gap-5 pb-1 text-sm">
          <Link href="/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Explore
          </Link>
          <Link href="/how-it-works/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
