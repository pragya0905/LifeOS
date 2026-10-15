// A minimal trend line for a StatTile/ListRow subtitle — Insights/Budget's full
// `LineChart` (components/LineChart.tsx) stays the tool for anything with axes/labels;
// this is for a single glanceable trend with no chrome at all.
export function Sparkline({
  values,
  width = 64,
  height = 20,
  className = "stroke-bloom",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} />
    </svg>
  );
}
