import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

// Lightweight performance visibility for a single-user app: log Core Web Vitals to the
// console instead of standing up a metrics backend/dashboard, which would be infra
// disproportionate to what a personal app needs. Open DevTools to see these.
function logMetric(metric: Metric) {
  const rounded = metric.name === "CLS" ? metric.value.toFixed(3) : Math.round(metric.value);
  console.info(`[web-vitals] ${metric.name}: ${rounded} (${metric.rating})`);
}

export function reportWebVitals() {
  onCLS(logMetric);
  onFCP(logMetric);
  onINP(logMetric);
  onLCP(logMetric);
  onTTFB(logMetric);
}
