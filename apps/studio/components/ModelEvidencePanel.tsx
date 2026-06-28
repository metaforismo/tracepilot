import type { ModelDecisionMetadata, RunMetrics, TraceStep } from "@tracepilot/core";
import { formatNumber, formatUsd } from "../lib/format";

type ModelEvidencePanelProps = {
  metrics: RunMetrics;
  selectedStep: TraceStep;
  steps: TraceStep[];
};

type ModelStep = {
  metadata: ModelDecisionMetadata;
  stepIndex: number;
};

export function ModelEvidencePanel({ metrics, selectedStep, steps }: ModelEvidencePanelProps) {
  const modelSteps = steps.flatMap((step): ModelStep[] => {
    if (!step.decision.modelRun) return [];
    return [{ metadata: step.decision.modelRun, stepIndex: step.stepIndex }];
  });
  const selectedModelRun = selectedStep.decision.modelRun;
  const driverFailures = steps.filter(isDriverDecisionFailure);
  const providerModels = [...new Set(modelSteps.map(({ metadata }) => `${metadata.provider} / ${metadata.model}`))];
  const totals = modelSteps.reduce(
    (accumulator, { metadata }) => ({
      inputTokens: accumulator.inputTokens + metadata.usage.inputTokens,
      outputTokens: accumulator.outputTokens + metadata.usage.outputTokens,
      reasoningTokens: accumulator.reasoningTokens + (metadata.reasoningTokens ?? 0),
      latencyMs: accumulator.latencyMs + metadata.latencyMs
    }),
    { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, latencyMs: 0 }
  );
  const meanLatencyMs = modelSteps.length === 0 ? 0 : Math.round(totals.latencyMs / modelSteps.length);

  return (
    <section className="panel" aria-label="Model API evidence">
      <div className="panelHeader">
        <h2>Model API evidence</h2>
        <span className={`status ${metrics.budgetExceeded ? "failure" : "success"}`}>
          {metrics.budgetExceeded ? "Budget exceeded" : "Budget within"}
        </span>
      </div>

      <div className="modelEvidence">
        <div className="modelEvidenceSummary">
          <EvidenceMetric label="Model steps" value={`${modelSteps.length}/${steps.length}`} />
          <EvidenceMetric label="Total model cost" value={formatUsd(metrics.totalCostUsd)} />
          <EvidenceMetric label="Input tokens" value={formatNumber(totals.inputTokens)} />
          <EvidenceMetric label="Output tokens" value={formatNumber(totals.outputTokens)} />
          <EvidenceMetric label="Reasoning tokens" value={formatNumber(totals.reasoningTokens)} />
          <EvidenceMetric label="Mean latency" value={`${meanLatencyMs}ms`} />
          <EvidenceMetric label="Driver failures" value={String(driverFailures.length)} tone={driverFailures.length > 0 ? "failure" : "default"} />
          <EvidenceMetric label="Provider models" value={providerModels.length === 0 ? "none" : providerModels.join(", ")} />
        </div>

        <div className="detailBlock">
          <h3>Selected model decision</h3>
          {selectedModelRun ? (
            <div className="modelEvidenceRows">
              <EvidenceRow label="Source" value={selectedModelRun.source} />
              <EvidenceRow label="Provider" value={selectedModelRun.provider} />
              <EvidenceRow label="Model" value={selectedModelRun.model} />
              <EvidenceRow label="Resolved model" value={selectedModelRun.resolvedModel ?? "not reported"} />
              <EvidenceRow label="Input tokens" value={formatNumber(selectedModelRun.usage.inputTokens)} />
              <EvidenceRow label="Output tokens" value={formatNumber(selectedModelRun.usage.outputTokens)} />
              <EvidenceRow label="Reasoning tokens" value={formatNumber(selectedModelRun.reasoningTokens ?? 0)} />
              <EvidenceRow label="Decision latency" value={`${selectedModelRun.latencyMs}ms`} />
              <EvidenceRow label="Step cost" value={formatUsd(selectedModelRun.costUsd)} />
              <EvidenceRow
                label="Pricing"
                value={`${selectedModelRun.pricing.inputUsdPerMillionTokens}/M input, ${selectedModelRun.pricing.outputUsdPerMillionTokens}/M output`}
              />
            </div>
          ) : (
            <p className="mutedCopy">No model metadata is attached to this synthetic harness step.</p>
          )}
        </div>

        {isDriverDecisionFailure(selectedStep) ? (
          <div className="driverFailureBox">
            <h3>Driver decision failed</h3>
            <p>{selectedStep.decision.reasoning.replace("Driver decision failed: ", "")}</p>
            {selectedStep.verifier.suggestedRecovery ? <p>{selectedStep.verifier.suggestedRecovery}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EvidenceMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "failure" }) {
  return (
    <div className={`evidenceMetric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="modelEvidenceRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isDriverDecisionFailure(step: TraceStep): boolean {
  return step.decision.reasoning.startsWith("Driver decision failed:");
}