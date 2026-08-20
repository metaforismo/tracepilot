import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Database,
  GitCompareArrows,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import type {
  ReadinessHistorySnapshot,
  ReadinessHistoryTrend,
  ReadinessRegression
} from "@tracepilot/core/readiness-history";
import {
  ReadinessHistoryChart,
  type ReadinessTrendDatum
} from "../../components/ReadinessHistoryChart";
import styles from "../../components/ReadinessHistory.module.css";
import { StudioShell } from "../../components/StudioShell";
import { formatPercent, formatUsdCompact, shortDate } from "../../lib/format";
import { loadReadinessHistory } from "../../lib/readiness-history-artifacts";

type ReadinessGateDecision = ReadinessHistorySnapshot["decision"];

export const dynamic = "force-dynamic";

const decisionClasses: Record<ReadinessGateDecision, string> = {
  pass: styles.decisionPass!,
  warn: styles.decisionWarn!,
  fail: styles.decisionFail!,
  blocked: styles.decisionBlocked!
};

export default async function ReadinessHistoryPage() {
  const history = await loadReadinessHistory();
  const latest = history.snapshots.at(-1);
  if (latest === undefined) {
    throw new Error("Readiness history has no snapshots.");
  }
  const previous = history.snapshots.at(-2);
  const activeRegressions = history.regressions.filter(
    (regression) => regression.currentSnapshotId === latest.id
  );
  const regressionCountBySnapshot = countRegressions(history.regressions);
  const providerSuccess = series(history.snapshots, (snapshot) => snapshot.provider.successRate);
  const stuckLoops = series(history.snapshots, (snapshot) => snapshot.provider.stuckLoopRate);
  const costPerSuccess = series(history.snapshots, (snapshot) => snapshot.provider.costPerSuccessUsd);

  return (
    <StudioShell icon={<GitCompareArrows size={18} />} subtitle="Release intelligence">
      <div className={styles.page}>
        <header className={`${styles.pageHeader} ${styles.reveal}`}>
          <div>
            <span className={styles.pageEyebrow}>Release regression control room</span>
            <h1>Readiness history</h1>
            <p>
              Track browser-control reliability, safety failures, and cost across repeated
              provider-backed gates—then isolate the exact release where evidence regressed.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.primaryAction} href="/readiness">
              Open latest gate
              <ArrowRight size={14} />
            </Link>
            <Link className={styles.secondaryAction} href="/scorecards/provider">
              Provider evidence
            </Link>
          </div>
        </header>

        <section className={`${styles.releaseHero} ${styles.reveal} ${styles.delayOne}`}>
          <div className={styles.releaseSummary}>
            <div className={styles.heroMetaRow}>
              <span className={`${styles.decisionBadge} ${decisionClasses[latest.decision]}`}>
                {latest.decision}
              </span>
              <span className={`${styles.trendBadge} ${trendClass(history.summary.trend)}`}>
                {trendIcon(history.summary.trend)}
                {trendLabel(history.summary.trend)}
              </span>
              <span className={styles.sourceBadge}>
                <Database size={13} />
                {history.source === "generated" ? "generated evidence" : `${history.source} source`}
              </span>
            </div>
            <span className={styles.sectionEyebrow}>Current release signal</span>
            <h2>{releaseHeadline(history.summary.trend, activeRegressions.length)}</h2>
            <p>
              {latest.label} was evaluated on {shortDate(latest.generatedAt)}. The latest gate
              moved from <strong>{previous?.decision ?? "no prior decision"}</strong> to{" "}
              <strong>{latest.decision}</strong>, with {activeRegressions.length} active regression
              {activeRegressions.length === 1 ? "" : "s"} requiring review.
            </p>
          </div>
          <div className={styles.releaseScore}>
            <span>Rules passing</span>
            <strong>{latest.rules.passed}/{latest.rules.total}</strong>
            <small>{latest.rules.failed} failed · {latest.rules.warned} warned</small>
          </div>
        </section>

        {history.source === "generated" ? null : (
          <aside className={`${styles.provenanceNotice} ${styles.reveal} ${styles.delayTwo}`}>
            <Database size={16} />
            <div>
              <strong>{history.source === "fixture" ? "Committed fixture fallback" : "Mixed evidence sources"}</strong>
              <span>
                {history.source === "fixture"
                  ? "Studio is showing representative history because no generated artifact exists yet."
                  : "This artifact combines generated and representative fixture snapshots; fixture rows remain illustrative."}
                {" "}Running the readiness gate writes persistent evidence to
                <code> runs/history/readiness-gate/readiness-history.json</code>.
              </span>
            </div>
          </aside>
        )}

        <section className={`${styles.metricStrip} ${styles.reveal} ${styles.delayTwo}`} aria-label="Latest release metrics">
          <Metric
            label="Provider success"
            value={formatNullablePercent(latest.provider.successRate)}
            detail={deltaDetail(latest.provider.successRate, previous?.provider.successRate, "higher")}
          />
          <Metric
            label="Stuck-loop rate"
            value={formatNullablePercent(latest.provider.stuckLoopRate)}
            detail={deltaDetail(latest.provider.stuckLoopRate, previous?.provider.stuckLoopRate, "lower")}
          />
          <Metric
            label="Cost / success"
            value={formatNullableUsd(latest.provider.costPerSuccessUsd)}
            detail={usdDeltaDetail(latest.provider.costPerSuccessUsd, previous?.provider.costPerSuccessUsd)}
          />
          <Metric
            label="Paid calls"
            value={String(latest.provider.paidCalls)}
            detail={`${latest.provider.executedRuns}/${latest.provider.plannedRuns} runs executed`}
          />
        </section>

        <div className={`${styles.chartStack} ${styles.reveal} ${styles.delayThree}`}>
          <ReadinessHistoryChart
            betterDirection="higher"
            data={providerSuccess}
            description="Successful provider-backed browser-control runs over each release gate."
            format="percent"
            threshold={latest.thresholds.minSuccessRate}
            thresholdLabel="minimum"
            title="Provider success rate"
            tone="success"
          />
          <div className={styles.chartGrid}>
            <ReadinessHistoryChart
              betterDirection="lower"
              data={stuckLoops}
              description="Runs that repeated semantically equivalent actions without progress."
              format="percent"
              threshold={latest.thresholds.maxStuckLoopRate}
              thresholdLabel="maximum"
              title="Stuck-loop rate"
              tone="risk"
            />
            <ReadinessHistoryChart
              betterDirection="lower"
              data={costPerSuccess}
              description="Provider spend divided by successful provider-backed runs."
              format="usd"
              title="Cost per successful run"
              tone="cost"
            />
          </div>
        </div>

        <section className={`${styles.regressionSection} ${styles.reveal} ${styles.delayFour}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Latest release</span>
              <h2>Active regressions</h2>
              <p>Only deltas crossing explicit warn or fail bands are surfaced here.</p>
            </div>
            <span className={styles.regressionCount}>{activeRegressions.length}</span>
          </div>

          {activeRegressions.length === 0 ? (
            <div className={styles.cleanState}>
              <CheckCircle2 size={18} />
              <div>
                <strong>No threshold-crossing regression detected</strong>
                <span>The latest evidence is stable or improving against the previous snapshot.</span>
              </div>
            </div>
          ) : (
            <div className={styles.regressionList}>
              {activeRegressions.map((regression) => (
                <article className={styles.regressionRow} key={regression.id}>
                  <span className={`${styles.regressionIcon} ${styles[regression.severity]}`}>
                    <ShieldAlert size={16} />
                  </span>
                  <div>
                    <div className={styles.regressionTitleRow}>
                      <strong>{regressionLabel(regression.metric)}</strong>
                      <span className={`${styles.severityBadge} ${styles[regression.severity]}`}>
                        {regression.severity}
                      </span>
                    </div>
                    <p>{regression.message}</p>
                  </div>
                  <span className={styles.regressionDelta}>{formatRegressionDelta(regression)}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.timelineSection} ${styles.reveal} ${styles.delayFour}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Evidence ledger</span>
              <h2>Release timeline</h2>
              <p>{history.summary.snapshotCount} retained gates, newest last.</p>
            </div>
            <span className={styles.retentionBadge}>
              <CalendarClock size={14} />
              retain {history.retention}
            </span>
          </div>

          <div className={styles.tableScroller}>
            <table className={styles.timelineTable}>
              <thead>
                <tr>
                  <th scope="col">Release</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Success</th>
                  <th scope="col">Stuck loop</th>
                  <th scope="col">Cost / success</th>
                  <th scope="col">Regressions</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {history.snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <th scope="row">
                      <span>{snapshot.label}</span>
                      <small>
                        {shortDate(snapshot.generatedAt)}
                        {snapshot.revision === undefined ? "" : ` · ${snapshot.revision.slice(0, 8)}`}
                      </small>
                    </th>
                    <td>
                      <span className={`${styles.tableDecision} ${decisionClasses[snapshot.decision]}`}>
                        {snapshot.decision}
                      </span>
                    </td>
                    <td>{formatNullablePercent(snapshot.provider.successRate)}</td>
                    <td>{formatNullablePercent(snapshot.provider.stuckLoopRate)}</td>
                    <td>{formatNullableUsd(snapshot.provider.costPerSuccessUsd)}</td>
                    <td>
                      <span className={regressionCountBySnapshot.get(snapshot.id) ? styles.hasRegression : styles.noRegression}>
                        {regressionCountBySnapshot.get(snapshot.id) ?? 0}
                      </span>
                    </td>
                    <td><span className={styles.sourceCell}>{snapshot.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {history.warnings.length === 0 ? null : (
          <section className={styles.warningFooter} aria-label="History warnings">
            {history.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </section>
        )}
      </div>
    </StudioShell>
  );
}

function Metric(props: { label: string; value: string; detail: string }) {
  return (
    <div className={styles.metric}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </div>
  );
}

function series(
  snapshots: ReadinessHistorySnapshot[],
  select: (snapshot: ReadinessHistorySnapshot) => number | null
): ReadinessTrendDatum[] {
  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    label: snapshot.label,
    generatedAt: snapshot.generatedAt,
    value: select(snapshot)
  }));
}

function countRegressions(regressions: ReadinessRegression[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const regression of regressions) {
    counts.set(regression.currentSnapshotId, (counts.get(regression.currentSnapshotId) ?? 0) + 1);
  }
  return counts;
}

function trendClass(trend: ReadinessHistoryTrend): string {
  switch (trend) {
    case "improving":
      return styles.trendImproving!;
    case "regressing":
      return styles.trendRegressing!;
    case "stable":
      return styles.trendStable!;
    case "insufficient_evidence":
      return styles.trendUnknown!;
  }
}

function trendIcon(trend: ReadinessHistoryTrend) {
  switch (trend) {
    case "improving":
      return <TrendingUp size={13} />;
    case "regressing":
      return <TrendingDown size={13} />;
    default:
      return <Minus size={13} />;
  }
}

function trendLabel(trend: ReadinessHistoryTrend): string {
  return trend.replace("_", " ");
}

function releaseHeadline(trend: ReadinessHistoryTrend, activeRegressions: number): string {
  if (trend === "regressing") {
    return `${activeRegressions} release regression${activeRegressions === 1 ? "" : "s"} ${activeRegressions === 1 ? "needs" : "need"} attention`;
  }
  if (trend === "improving") return "The latest release improved its evidence signal";
  if (trend === "stable") return "The latest release is holding steady";
  return "More repeated evidence is needed";
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "No evidence" : formatPercent(value);
}

function formatNullableUsd(value: number | null): string {
  return value === null ? "No evidence" : formatUsdCompact(value);
}

function deltaDetail(
  current: number | null,
  previous: number | null | undefined,
  betterDirection: "higher" | "lower"
): string {
  if (current === null || previous === null || previous === undefined) return "No comparable prior evidence";
  const delta = current - previous;
  if (Math.abs(delta) < 1e-12) return "0.0 pp · stable";
  const beneficial = betterDirection === "higher" ? delta > 0 : delta < 0;
  return `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp · ${beneficial ? "favorable" : "regression"}`;
}

function usdDeltaDetail(current: number | null, previous: number | null | undefined): string {
  if (current === null || previous === null || previous === undefined || previous === 0) {
    return "No comparable prior evidence";
  }
  const ratio = current / previous - 1;
  if (Math.abs(ratio) < 1e-12) return "0.0% · stable";
  return `${ratio > 0 ? "+" : ""}${(ratio * 100).toFixed(1)}% vs previous`;
}

function regressionLabel(metric: ReadinessRegression["metric"]): string {
  switch (metric) {
    case "decision":
      return "Release decision deteriorated";
    case "provider-success-rate":
      return "Provider success rate";
    case "provider-false-completion-rate":
      return "False-completion rate";
    case "provider-stuck-loop-rate":
      return "Stuck-loop rate";
    case "provider-cost-per-success":
      return "Cost per successful run";
  }
}

function formatRegressionDelta(regression: ReadinessRegression): string {
  if (regression.delta === null) return `${regression.previousValue} → ${regression.currentValue}`;
  if (regression.metric === "provider-cost-per-success") {
    return `+${(regression.delta * 100).toFixed(1)}%`;
  }
  if (regression.metric === "decision") return `${regression.previousValue} → ${regression.currentValue}`;
  return `${regression.delta > 0 ? "+" : ""}${(regression.delta * 100).toFixed(1)} pp`;
}
