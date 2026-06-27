import Link from "next/link";
import { Activity, ArrowLeft, ClipboardCheck, TriangleAlert } from "lucide-react";
import type {
  ReadinessGateRule,
  ReadinessGateThresholds,
  ReadinessProviderEvidence,
  ReadinessReliabilityEvidence
} from "@tracepilot/core";
import { loadReadinessGate } from "../../lib/readiness-fixtures";

export default async function ReadinessPage() {
  const gate = await loadReadinessGate();
  const generatedAt = new Date(gate.generatedAt).toISOString();

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><ClipboardCheck size={18} /></div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>Readiness gate</span>
          </div>
        </div>

        <Link className="ghostButton" href="/">
          <ArrowLeft size={15} />
          Runs
        </Link>

        <span className="sectionLabel">Decision</span>
        <div className="taskItem">
          <strong>Decision</strong>
          <small>{generatedAt}</small>
          <span className={`status ${gate.decision}`}>{gate.decision}</span>
        </div>

        <span className="sectionLabel">Evidence</span>
        <div className="taskList">
          <a className="taskItem" href="#reliability-evidence">
            <strong>Reliability evidence</strong>
            <small>{gate.input.reliability.runs} deterministic runs</small>
          </a>
          <a className="taskItem" href="#provider-evidence">
            <strong>Provider evidence</strong>
            <small>{gate.input.provider.executedRuns} of {gate.input.provider.plannedRuns} rows executed</small>
          </a>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>Readiness gate</h1>
            <p>Operational decision from reliability and provider scorecard evidence.</p>
          </div>
          <div className="buttonRow">
            <Link className="ghostButton" href="/diagnostics">
              <TriangleAlert size={15} />
              Diagnostics
            </Link>
            <Link className="ghostButton" href="/runs/smoke-form">
              <Activity size={15} />
              Open trace
            </Link>
          </div>
        </div>

        <div className="diagnosticGrid">
          <section className="panel" aria-label="Readiness summary">
            <div className="panelHeader">
              <h2>Summary</h2>
              <span className="meta">{gate.summary.totalRules} rules</span>
            </div>
            <div className="summaryGrid readinessSummary">
              <Metric label="passed" value={gate.summary.passedRules} />
              <Metric label="warned" value={gate.summary.warnedRules} />
              <Metric label="failed" value={gate.summary.failedRules} />
              <Metric label="blocked" value={gate.summary.blockedRules} />
              <Metric label="total" value={gate.summary.totalRules} />
            </div>
          </section>

          <section className="panel" aria-label="Readiness thresholds">
            <div className="panelHeader">
              <h2>Thresholds</h2>
              <span className="meta">{formatPercent(gate.input.thresholds.confidence)} confidence</span>
            </div>
            <div className="thresholdGrid">
              {thresholdRows(gate.input.thresholds).map((row) => (
                <div className="thresholdItem" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="readinessGrid">
          <EvidencePanel
            id="reliability-evidence"
            title="Reliability evidence"
            meta={gate.input.reliability.status}
            rows={reliabilityRows(gate.input.reliability)}
          />
          <EvidencePanel
            id="provider-evidence"
            title="Provider evidence"
            meta={gate.input.provider.status}
            rows={providerRows(gate.input.provider)}
          />
        </div>

        <section className="panel" aria-label="Readiness rule outcomes">
          <div className="panelHeader">
            <h2>Rule outcomes</h2>
            <span className="meta">{gate.summary.highestSeverity}</span>
          </div>
          <div className="ruleTable">
            <div className="ruleRow header">
              <span>Rule</span>
              <span>Severity</span>
              <span>Observed</span>
              <span>Threshold</span>
              <span>Message</span>
            </div>
            {gate.rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        </section>

        {gate.warnings.length > 0 ? (
          <section className="panel" aria-label="Readiness warnings">
            <div className="panelHeader">
              <h2>Warnings</h2>
              <span className="meta">{gate.warnings.length} active</span>
            </div>
            <div className="warningList">
              {gate.warnings.map((warning) => (
                <div className="warningItem" key={warning}>{warning}</div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function EvidencePanel(props: { id: string; title: string; meta: string; rows: Array<{ label: string; value: string | number }> }) {
  return (
    <section className="panel" id={props.id} aria-label={props.title}>
      <div className="panelHeader">
        <h2>{props.title}</h2>
        <span className="meta">{props.meta}</span>
      </div>
      <div className="evidenceList">
        {props.rows.map((row) => (
          <div className="evidenceRow" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RuleRow(props: { rule: ReadinessGateRule }) {
  return (
    <div className="ruleRow">
      <strong className="mono">{props.rule.id}</strong>
      <span className={`status ${props.rule.severity}`}>{props.rule.severity}</span>
      <span>{formatObserved(props.rule)}</span>
      <span>{formatThreshold(props.rule)}</span>
      <span>{props.rule.message}</span>
    </div>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function reliabilityRows(evidence: ReadinessReliabilityEvidence): Array<{ label: string; value: string | number }> {
  return [
    { label: "suite", value: evidence.suiteId },
    { label: "runs", value: evidence.runs },
    { label: "successes", value: evidence.successes },
    { label: "false completions", value: evidence.falseCompletions },
    { label: "stuck loops", value: evidence.stuckLoops },
    { label: "unsafe blocks", value: evidence.unsafeBlocks },
    { label: "human approvals", value: evidence.humanApprovals },
    { label: "total cost", value: formatUsd(evidence.totalCostUsd) }
  ];
}

function providerRows(evidence: ReadinessProviderEvidence): Array<{ label: string; value: string | number }> {
  return [
    { label: "suite", value: evidence.suiteId },
    { label: "status", value: evidence.status },
    { label: "planned runs", value: evidence.plannedRuns },
    { label: "executed runs", value: evidence.executedRuns },
    { label: "paid calls", value: evidence.paidCalls },
    { label: "successes", value: evidence.successes },
    { label: "false completions", value: evidence.falseCompletions },
    { label: "stuck loops", value: evidence.stuckLoops },
    { label: "unsafe blocks", value: evidence.unsafeBlocks },
    { label: "total cost", value: formatUsd(evidence.totalCostUsd) }
  ];
}

function thresholdRows(thresholds: ReadinessGateThresholds): Array<{ label: string; value: string }> {
  return [
    { label: "confidence", value: formatPercent(thresholds.confidence) },
    { label: "min reliability runs", value: String(thresholds.minReliabilityRuns) },
    { label: "min provider runs", value: String(thresholds.minProviderRuns) },
    { label: "min success lower bound", value: formatPercent(thresholds.minSuccessRate) },
    { label: "max false completion upper bound", value: formatPercent(thresholds.maxFalseCompletionRate) },
    { label: "max stuck-loop upper bound", value: formatPercent(thresholds.maxStuckLoopRate) },
    { label: "max provider cost", value: formatUsd(thresholds.maxCostUsd) }
  ];
}

function formatObserved(rule: ReadinessGateRule): string {
  if (rule.id.endsWith("rate")) {
    return rule.interval === undefined
      ? formatPercent(rule.observed)
      : `${formatPercent(rule.observed)} (${formatPercent(rule.interval.lower)}-${formatPercent(rule.interval.upper)})`;
  }
  if (rule.id === "provider-cost") {
    return formatUsd(rule.observed);
  }
  return String(rule.observed);
}

function formatThreshold(rule: ReadinessGateRule): string {
  if (rule.id.endsWith("rate")) {
    return formatPercent(rule.threshold);
  }
  if (rule.id === "provider-cost") {
    return formatUsd(rule.threshold);
  }
  return String(rule.threshold);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
