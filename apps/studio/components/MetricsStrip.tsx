import type { RunMetrics } from "@tracepilot/core";

export function MetricsStrip({ metrics }: { metrics: RunMetrics }) {
  const items = [
    ["Success", metrics.success ? "yes" : "no"],
    ["Steps", String(metrics.steps)],
    ["False complete", metrics.falseCompletion ? "yes" : "no"],
    ["Stuck loop", metrics.stuckLoop ? "yes" : "no"],
    ["Unsafe blocked", metrics.unsafeBlocked ? "yes" : "no"],
    ["Duration", `${metrics.durationMs}ms`]
  ] as const;

  return (
    <section className="metricsStrip" aria-label="Run metrics">
      {items.map(([label, value]) => (
        <div className="metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

