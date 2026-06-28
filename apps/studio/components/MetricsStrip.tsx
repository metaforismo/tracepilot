import type { RunMetrics } from "@tracepilot/core";
import { formatUsd, yesNo } from "../lib/format";
import { Metric } from "./Metric";

export function MetricsStrip({ metrics }: { metrics: RunMetrics }) {
  return (
    <section className="metricsStrip" aria-label="Run metrics">
      <Metric label="Success" tone={metrics.success ? "pass" : "fail"} value={yesNo(metrics.success)} />
      <Metric label="Steps" value={String(metrics.steps)} />
      <Metric label="Total model cost" value={formatUsd(metrics.totalCostUsd)} />
      <Metric
        label="Budget"
        tone={metrics.budgetExceeded ? "fail" : "pass"}
        value={metrics.budgetExceeded ? "Budget exceeded" : "within"}
      />
      <Metric label="False complete" tone={metrics.falseCompletion ? "warn" : "pass"} value={yesNo(metrics.falseCompletion)} />
      <Metric label="Stuck loop" tone={metrics.stuckLoop ? "warn" : "pass"} value={yesNo(metrics.stuckLoop)} />
      <Metric label="Unsafe blocked" tone={metrics.unsafeBlocked ? "warn" : "pass"} value={yesNo(metrics.unsafeBlocked)} />
      <Metric label="Duration" value={`${metrics.durationMs}ms`} />
    </section>
  );
}