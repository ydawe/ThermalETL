import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ValidationNumbers from "@/components/ValidationNumbers";

export const metadata: Metadata = {
  title: "How it works: ThermalETL",
  description: "How ThermalETL joins MODIS and VIIRS fire hotspots into one consistent history.",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-3">
      <span className="font-display text-3xl leading-none text-ember" aria-hidden>
        {n}
      </span>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-ink-soft">{children}</p>
      </div>
    </li>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 animate-rise px-4 pb-16 pt-6 sm:px-6">
        <h1 className="font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">How it works</h1>
        <p className="mt-3 text-lg text-ink-soft">
          Satellites spot fires as hot pixels. MODIS has done this since 2000; VIIRS, since 2012, sees far more small
          fires. Put them side by side and it looks like fires suddenly multiplied in 2012. ThermalETL corrects for
          that, so twenty-plus years can be compared fairly.
        </p>

        <section aria-labelledby="steps" className="mt-10">
          <h2 id="steps" className="font-display text-2xl text-ink">The idea in four steps</h2>
          <ol className="mt-4 space-y-5">
            <Step n={1} title="Count hotspots on a hexagon grid">
              Every detection is placed in a hexagon about 250 km² in size (H3 resolution 5) and counted per month,
              separately for MODIS and VIIRS.
            </Step>
            <Step n={2} title="Learn how the two sensors relate">
              In years when both satellites flew, we compute k = VIIRS ÷ MODIS for each hexagon and each calendar
              month. Spring grass burning and summer crop fires behave differently, so k does too.
            </Step>
            <Step n={3} title="Fill thin data from the neighbourhood">
              If a hexagon had fewer than 5 MODIS detections in a month, we borrow k from the surrounding area, then a
              wider area, then the whole region. The map&apos;s hexagon panel shows which level was used.
            </Step>
            <Step n={4} title="Build one harmonized series">
              From 2012 onward we use VIIRS counts as-is (including quiet months with zero). Before 2012 we multiply
              MODIS by k. The fire calendar then compares every month with the median of the same month across all
              years.
            </Step>
          </ol>
        </section>

        <section aria-labelledby="validation" className="mt-12">
          <h2 id="validation" className="font-display text-2xl text-ink">Does a per-hexagon k help?</h2>
          <div className="mt-4">
            <ValidationNumbers />
          </div>
        </section>

        <section aria-labelledby="sources" className="mt-12">
          <h2 id="sources" className="font-display text-2xl text-ink">Data sources</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
            <li>
              <a className="text-tide underline underline-offset-2" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
                NASA FIRMS
              </a>{" "}
              : MODIS Collection 6.1 (Terra &amp; Aqua) standard product, confidence ≥ 30.
            </li>
            <li>VIIRS S-NPP 375 m standard product, nominal and high confidence only.</li>
            <li>Near-real-time FIRMS feeds for the most recent days, de-duplicated against the standard archive.</li>
            <li>
              Basemap by{" "}
              <a className="text-tide underline underline-offset-2" href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
                OpenFreeMap
              </a>{" "}
              with OpenMapTiles and OpenStreetMap data.
            </li>
          </ul>
        </section>

        <section aria-labelledby="limits" className="mt-12">
          <h2 id="limits" className="font-display text-2xl text-ink">What this can&apos;t tell you</h2>
          <ul className="mt-3 space-y-3 text-ink-soft">
            <li>
              <strong className="text-ink">Hotspots are not burned area.</strong> One large fire can produce many
              hotspots, and a short, small fire may produce none. Counts show activity, not hectares.
            </li>
            <li>
              <strong className="text-ink">Clouds and overpass times hide fires.</strong> Satellites pass only a few
              times a day and cannot see through cloud, so a cloudy month can look quieter than it was.
            </li>
            <li>
              <strong className="text-ink">MODIS is retiring.</strong> Terra and Aqua are near the end of their
              missions. Once MODIS stops, k can&apos;t be updated, but VIIRS continues the series directly.
            </li>
            <li>
              <strong className="text-ink">History, not forecasts.</strong> “More than usual” compares a month with
              past years. It does not predict future fires.
            </li>
            <li>
              <strong className="text-ink">Not every hotspot is a wildfire.</strong> Field burning, industrial heat
              sources and gas flares can be detected too.
            </li>
            <li>
              <strong className="text-ink">Early-2000s totals can look huge after scaling.</strong> In Poland,
              harmonized years 2002–2005 often show ~26–40 thousand hotspots versus ~5–9 thousand in later years.
              Some of that is real (more open-field burning, especially in the east), but a regional conversion
              factor around 9× amplifies the jump whenever we scale MODIS-only months by k.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
