import { fmt, formatMonth, type Summary } from "@/lib/analysis";

export default function SummaryCards({ summary }: { summary: Summary }) {
  const { season, activeYears, latest } = summary;
  const tone =
    latest?.direction === "more" || latest?.direction === "new"
      ? "border-[rgb(178,24,43)]"
      : latest?.direction === "fewer"
        ? "border-[rgb(33,102,172)]"
        : "border-ink/30";
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plain-language summary">
      <li className="animate-rise border-l-4 border-ember bg-white/70 p-3 [animation-delay:60ms] sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Main fire season here</p>
        <p className="mt-1 font-display text-lg leading-snug text-ink">{season}</p>
      </li>
      <li className="animate-rise border-l-4 border-tide bg-white/70 p-3 [animation-delay:120ms]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Most active years</p>
        {activeYears.length ? (
          <ol className="mt-1 space-y-0.5">
            {activeYears.map((y, i) => (
              <li key={y.year} className="flex items-baseline justify-between gap-2 tabular-nums">
                <span className={`font-display ${i === 0 ? "text-lg" : "text-base"} text-ink`}>{y.year}</span>
                <span className="text-xs text-ink-mute">{fmt(y.total)} hotspots</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">No hotspots in the selected dates.</p>
        )}
      </li>
      <li className={`animate-rise border-l-4 ${tone} bg-white/70 p-3 [animation-delay:180ms]`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          {latest ? `Last month (${formatMonth(latest.key)}) vs usual` : "Last month vs usual"}
        </p>
        <p className="mt-1 text-[15px] leading-snug text-ink">{latest ? latest.sentence : "Pick a date range with data."}</p>
      </li>
    </ul>
  );
}
