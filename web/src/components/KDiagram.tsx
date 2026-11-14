import { viridis, rgb } from "@/lib/colors";

const R = 22;
const W = Math.sqrt(3) * R;

function hexPoints(cx: number, cy: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const LOCAL_K = [
  [2.1, 3.4, 4.8, 5.6],
  [2.8, 4.2, 6.9, 5.1],
  [3.6, 5.4, 8.2, 4.4],
];

function Grid({ x0, title, values }: { x0: number; title: string; values: number[][] }) {
  return (
    <g>
      <text x={x0} y={18} className="fill-ink font-display" fontSize={15} fontWeight={600}>
        {title}
      </text>
      {values.map((row, r) =>
        row.map((k, c) => {
          const cx = x0 + R + c * W + (r % 2 ? W / 2 : 0);
          const cy = 50 + r * R * 1.5;
          const fill = viridis((k - 1.5) / 7.5);
          return (
            <g key={`${r}-${c}`}>
              <polygon points={hexPoints(cx, cy)} fill={rgb(fill)} stroke="#ffffff" strokeWidth={1.5} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={k > 5.6 ? "#13262f" : "#ffffff"}>
                {k.toFixed(1)}
              </text>
            </g>
          );
        }),
      )}
    </g>
  );
}

export default function KDiagram({ regionalK }: { regionalK: number }) {
  const uniform = LOCAL_K.map((row) => row.map(() => regionalK));
  return (
    <figure className="border border-ink/10 bg-white/70 p-4">
      <svg viewBox="0 0 470 160" className="w-full" role="img" aria-labelledby="kdiag-title kdiag-desc">
        <title id="kdiag-title">One regional ratio versus a ratio per hexagon</title>
        <desc id="kdiag-desc">
          Left: every hexagon uses the same regional ratio of {regionalK.toFixed(1)}. Right: each hexagon uses its own
          ratio, from about 2 in quiet farmland to 8 where many small fires occur.
        </desc>
        <Grid x0={8} title="One regional k" values={uniform} />
        <text x={228} y={88} textAnchor="middle" fontSize={22} className="fill-ink-mute">
          →
        </text>
        <Grid x0={252} title="k per hexagon & month" values={LOCAL_K} />
      </svg>
      <figcaption className="mt-2 text-sm text-ink-soft">
        A single region-wide ratio over-counts quiet areas and under-counts places with many small fires. ThermalETL
        learns k for each hexagon and calendar month, and falls back to a wider area only when local data is thin.
      </figcaption>
    </figure>
  );
}
