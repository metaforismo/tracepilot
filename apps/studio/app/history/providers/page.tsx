import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  GitCompareArrows,
  ShieldAlert
} from "lucide-react";
import {
  latestProviderModelTransitions,
  type ProviderHistorySnapshot,
  type ProviderRegression
} from "@tracepilot/core/provider-history";
import { StudioShell } from "../../../components/StudioShell";
import styles from "../../../components/ProviderAttribution.module.css";
import { formatPercent, formatUsdCompact, shortDate } from "../../../lib/format";
import { loadProviderHistory } from "../../../lib/provider-history-artifacts";

export const dynamic = "force-dynamic";

export default async function ProviderRegressionAttributionPage() {
  const history = await loadProviderHistory();
  const latest = history.snapshots.at(-1);
  if (latest === undefined) throw new Error("Provider history has no snapshots.");
  const previous = history.snapshots.at(-2);
  const activeRegressions = history.regressions.filter(
    (regression) => regression.currentSnapshotId === latest.id
  );
  const groups = groupRegressions(activeRegressions);
  const modelTransitions = latestProviderModelTransitions(history);
  const regressionCountBySnapshot = countRegressions(history.regressions);

  return (
    <StudioShell icon={<GitCompareArrows size={18} />} subtitle="Provider attribution">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <span className={styles.eyebrow}>Release regression attribution</span>
            <h1>What changed?</h1>
            <p>
              Trace a release regression back to the provider, workflow, and model revision that
              produced it—without storing prompts, reasoning, or user-entered payloads in history.
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/history">
              Readiness history
              <ArrowRight size={14} />
            </Link>
            <Link className={styles.secondaryAction} href="/scorecards/provider">
              Provider evidence
            </Link>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <div className={styles.heroMeta}>
              <span className={`${styles.trendBadge} ${history.summary.trend === "regressing" ? "" : styles.clean}`}>
                <GitCompareArrows size={13} />
                {trendLabel(history.summary.trend)}
              </span>
              <span className={styles.sourceBadge}>
                <Database size={13} />
                {history.source === "generated" ? "generated evidence" : `${history.source} source`}
              </span>
              {latest.revision === undefined ? null : (
                <span className={styles.revisionBadge}>revision {latest.revision}</span>
              )}
            </div>
            <span className={styles.sectionEyebrow}>Latest release signal</span>
            <h2>{headline(groups.length, history.summary.modelChanges)}</h2>
            <p>
              {latest.label} ({shortDate(latest.generatedAt)}) is compared with {previous?.label ?? "no prior provider snapshot"}.
              {" "}Only threshold-crossing reliability or cost changes are escalated as regressions;
              missing paid evidence is kept as insufficient evidence instead of being scored as failure.
            </p>
          </div>
          <div className={styles.heroScore}>
            <span>Affected workflows</span>
            <strong>{history.summary.affectedTasks}</strong>
            <small>{activeRegressions.length} active signals</small>
          </div>
        </section>

        {history.source === "generated" ? null : (
          <aside className={styles.provenanceNotice}>
            <Database size={16} />
            <div>
              <strong>Committed fixture attribution</strong>
              <span>
                No generated provider history exists in this clone, so Studio is showing a bounded
                representative baseline/current pair. Real scorecard runs write to
                <code> runs/history/provider-scorecard/provider-history.json</code>.
              </span>
            </div>
          </aside>
        )}

        <section className={styles.metricStrip} aria-label="Attribution summary">
          <Metric label="Affected tasks" value={history.summary.affectedTasks} detail="threshold-crossing" />
          <Metric label="Providers" value={history.summary.affectedProviders} detail="with active regression" />
          <Metric label="Model changes" value={history.summary.modelChanges} detail="latest release pair" />
          <Metric label="Retained releases" value={history.summary.snapshotCount} detail={`retain ${history.retention}`} />
        </section>

        <section className={styles.section} aria-label="Active provider regressions">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Root-cause candidates</span>
              <h2>Regression attribution rail</h2>
              <p>Provider/task slices ranked by release evidence, not by model reputation.</p>
            </div>
            <span className={styles.countBadge}>{groups.length}</span>
          </div>

          {groups.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2 size={18} />
              <div>
                <strong>No active provider regression</strong>
                <span>The latest comparable provider/task evidence is stable or improving.</span>
              </div>
            </div>
          ) : (
            <div className={styles.attributionList}>
              {groups.map((group) => (
                <article className={styles.attributionRow} key={`${group.provider}:${group.taskId}`}>
                  <span className={styles.railMark}>
                    <ShieldAlert size={15} />
                  </span>
                  <div className={styles.identity}>
                    <span className={`${styles.severityBadge} ${group.severity === "fail" ? styles.fail : ""}`}>
                      {group.severity}
                    </span>
                    <strong>{providerLabel(group.provider)} · {taskLabel(group.taskId)}</strong>
                    <code>{group.provider}/{group.taskId}</code>
                  </div>
                  <div className={styles.modelTransition}>
                    <span>Model revision</span>
                    <div className={styles.modelPath}>
                      <span className={styles.modelBadge}>{group.previousModels.join(", ")}</span>
                      <ArrowRight className={styles.modelArrow} size={13} />
                      <span className={styles.modelBadge}>{group.currentModels.join(", ")}</span>
                    </div>
                  </div>
                  <div className={styles.metricDelta}>
                    <span>Evidence delta</span>
                    {group.regressions.map((regression) => (
                      <div key={regression.id}>
                        <strong>{metricLabel(regression)} · {formatRegressionDelta(regression)}</strong>
                        <p>
                          {formatRegressionValue(regression.previousValue, regression.metric)} →{" "}
                          {formatRegressionValue(regression.currentValue, regression.metric)}; {regression.severity} band at{" "}
                          {formatThreshold(regression)}.
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} aria-label="Model revision changes">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Revision context</span>
              <h2>Model changes in the latest pair</h2>
              <p>A model change is context, not proof of causality; metrics decide whether it is a regression.</p>
            </div>
          </div>
          {modelTransitions.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2 size={18} />
              <div>
                <strong>No model revision changed</strong>
                <span>Comparable provider/task slices used the same model set.</span>
              </div>
            </div>
          ) : (
            <div className={styles.modelChanges}>
              {modelTransitions.map((transition) => (
                <article className={styles.modelChange} key={`${transition.provider}:${transition.taskId}`}>
                  <strong>{providerLabel(transition.provider)} · {taskLabel(transition.taskId)}</strong>
                  <p>{transition.provider}/{transition.taskId}</p>
                  <div className={styles.modelPath}>
                    <span className={styles.modelBadge}>{transition.previousModels.join(", ")}</span>
                    <ArrowRight className={styles.modelArrow} size={13} />
                    <span className={styles.modelBadge}>{transition.currentModels.join(", ")}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} aria-label="Provider release ledger">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Evidence ledger</span>
              <h2>Provider release history</h2>
              <p>Each row is a validated snapshot with bounded scorecard evidence.</p>
            </div>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.timeline}>
              <thead>
                <tr>
                  <th scope="col">Release</th>
                  <th scope="col">Revision</th>
                  <th scope="col">Executed</th>
                  <th scope="col">Models</th>
                  <th scope="col">Regressions</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {history.snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{snapshot.label}<br /><small>{shortDate(snapshot.generatedAt)}</small></td>
                    <td>{snapshot.revision ?? "—"}</td>
                    <td>{executedRows(snapshot)}</td>
                    <td>{modelCount(snapshot)}</td>
                    <td>{regressionCountBySnapshot.get(snapshot.id) ?? 0}</td>
                    <td>{snapshot.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section} aria-label="Attribution boundary">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Evidence boundary</span>
              <h2>What this history stores</h2>
            </div>
          </div>
          <p className={styles.boundaryCopy}>
            Provider history stores task IDs, provider/model identifiers, attempt number, verifier
            outcomes, safety flags, approvals, step count and cost. It deliberately excludes prompts,
            model reasoning, DOM text, typed values, screenshots, API keys, trace directories and raw user payloads.
          </p>
        </section>
      </div>
    </StudioShell>
  );
}

type RegressionGroup = {
  provider: string;
  taskId: string;
  previousModels: string[];
  currentModels: string[];
  severity: "warn" | "fail";
  regressions: ProviderRegression[];
};

function groupRegressions(regressions: ProviderRegression[]): RegressionGroup[] {
  const groups = new Map<string, RegressionGroup>();
  for (const regression of regressions) {
    const key = `${regression.provider}\u001f${regression.taskId}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        provider: regression.provider,
        taskId: regression.taskId,
        previousModels: regression.previousModels,
        currentModels: regression.currentModels,
        severity: regression.severity,
        regressions: [regression]
      });
    } else {
      existing.regressions.push(regression);
      if (regression.severity === "fail") existing.severity = "fail";
    }
  }
  return [...groups.values()].sort((left, right) =>
    severityRank(right.severity) - severityRank(left.severity) ||
    left.provider.localeCompare(right.provider) ||
    left.taskId.localeCompare(right.taskId)
  );
}

function Metric(props: { label: string; value: number; detail: string }) {
  return (
    <div className={styles.metric}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </div>
  );
}

function trendLabel(trend: string): string {
  return trend.replaceAll("_", " ");
}

function headline(groups: number, modelChanges: number): string {
  if (groups === 0) return modelChanges > 0 ? "Models changed; release evidence did not regress." : "No provider regression needs attribution.";
  if (groups === 1) return modelChanges > 0 ? "One workflow regressed across a model revision." : "One workflow crossed a regression threshold.";
  return `${groups} workflows crossed provider regression thresholds.`;
}

function providerLabel(provider: string): string {
  return provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : provider;
}

function taskLabel(taskId: string): string {
  return taskId.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function metricLabel(regression: ProviderRegression): string {
  switch (regression.metric) {
    case "success-rate": return "Success rate";
    case "false-completion-rate": return "False completion";
    case "stuck-loop-rate": return "Stuck loop";
    case "cost-per-success": return "Cost / success";
  }
}

function formatRegressionDelta(regression: ProviderRegression): string {
  return regression.metric === "cost-per-success"
    ? `+${formatPercent(regression.delta)}`
    : `+${(regression.delta * 100).toFixed(1)} pp`;
}

function formatRegressionValue(value: number, metric: ProviderRegression["metric"]): string {
  return metric === "cost-per-success" ? formatUsdCompact(value) : formatPercent(value);
}

function formatThreshold(regression: ProviderRegression): string {
  return regression.metric === "cost-per-success"
    ? formatPercent(regression.threshold)
    : `${(regression.threshold * 100).toFixed(1)} pp`;
}

function countRegressions(regressions: ProviderRegression[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const regression of regressions) {
    counts.set(regression.currentSnapshotId, (counts.get(regression.currentSnapshotId) ?? 0) + 1);
  }
  return counts;
}

function executedRows(snapshot: ProviderHistorySnapshot): number {
  return snapshot.slices.reduce((sum, slice) => sum + slice.executedRuns, 0);
}

function modelCount(snapshot: ProviderHistorySnapshot): number {
  return new Set(snapshot.slices.flatMap((slice) => slice.models)).size;
}

function severityRank(severity: "warn" | "fail"): number {
  return severity === "fail" ? 2 : 1;
}
