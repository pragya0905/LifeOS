const WIDTH = 320;
const HEIGHT = 90;
const PADDING = 8;

export interface LineChartPoint {
  date: string;
  value: number;
}

// Small dependency-free trend chart — same pure-SVG approach as Ring, rather than
// pulling in a charting library for what's a handful of simple sparkline-style views.
export default function LineChart({
  points,
  color = "stroke-bloom",
  formatValue = (v: number) => String(v),
  targetValue,
  targetLabel,
}: {
  points: LineChartPoint[];
  color?: string;
  formatValue?: (value: number) => string;
  // Optional horizontal reference line (e.g. a weight target) — the value range expands to
  // include it so the line stays visible even when the actual data hasn't reached it yet.
  targetValue?: number;
  targetLabel?: string;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-ink-muted dark:text-mist-muted">Not enough data yet.</p>;
  }

  const values = points.map((p) => p.value);
  if (targetValue !== undefined) values.push(targetValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const toY = (value: number) => HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2);

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? WIDTH / 2
        : PADDING + (i / (points.length - 1)) * (WIDTH - PADDING * 2);
    return { x, y: toY(p.value) };
  });
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Trend from ${formatValue(first.value)} on ${first.date} to ${formatValue(last.value)} on ${last.date}${targetValue !== undefined ? `, target ${formatValue(targetValue)}` : ""}`}
      >
        {targetValue !== undefined && (
          <line
            x1={PADDING}
            x2={WIDTH - PADDING}
            y1={toY(targetValue)}
            y2={toY(targetValue)}
            strokeWidth={1}
            strokeDasharray="3,3"
            className="stroke-ink-muted dark:stroke-mist-muted"
          />
        )}
        <path d={pathD} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={color} />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2} className={color} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted dark:text-mist-muted">
        <span>
          {first.date} · {formatValue(first.value)}
        </span>
        {targetValue !== undefined ? (
          <span>
            {targetLabel ?? "Target"}: {formatValue(targetValue)}
          </span>
        ) : (
          <span />
        )}
        <span>
          {last.date} · {formatValue(last.value)}
        </span>
      </div>
    </div>
  );
}
