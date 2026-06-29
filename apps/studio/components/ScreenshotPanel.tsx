import type { TraceStep } from "@tracepilot/core";

export function ScreenshotPanel({ step }: { step: TraceStep }) {
  const src = normalizeScreenshotPath(step.observation.screenshotPath);

  return (
    <section className="panel" aria-label="Screenshot preview">
      <div className="panelHeader">
        <h2>Screenshot</h2>
        <span className="meta">{step.observation.viewport.width}x{step.observation.viewport.height}</span>
      </div>
      <div className="screenshotFrame">
        <img
          alt={`Observation ${step.observation.stepId}`}
          decoding="async"
          height={step.observation.viewport.height}
          loading="eager"
          src={src}
          width={step.observation.viewport.width}
        />
      </div>
    </section>
  );
}

function normalizeScreenshotPath(path: string): string {
  if (path.startsWith("/")) return path;
  if (path.startsWith("http")) return path;
  return `/${path}`;
}
