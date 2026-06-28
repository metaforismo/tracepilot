import Link from "next/link";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

type StepNavigatorProps = {
  runId: string;
  stepCount: number;
  stepIndex: number;
};

export function StepNavigator({ runId, stepCount, stepIndex }: StepNavigatorProps) {
  const hasPrevious = stepIndex > 0;
  const hasNext = stepIndex < stepCount - 1;
  const isLatest = stepIndex === stepCount - 1;

  return (
    <div className="stepNavigator" role="navigation" aria-label="Step navigation">
      {hasPrevious ? (
        <Link className="ghostButton" href={`/runs/${runId}?step=${stepIndex - 1}`}>
          <ChevronLeft size={15} />
          Previous
        </Link>
      ) : (
        <span className="ghostButton disabled" aria-disabled="true">
          <ChevronLeft size={15} />
          Previous
        </span>
      )}

      <span className="stepCounter">
        Step <strong>{stepIndex + 1}</strong> of {stepCount}
      </span>

      {hasNext ? (
        <Link className="ghostButton" href={`/runs/${runId}?step=${stepIndex + 1}`}>
          Next
          <ChevronRight size={15} />
        </Link>
      ) : (
        <span className="ghostButton disabled" aria-disabled="true">
          Next
          <ChevronRight size={15} />
        </span>
      )}

      {!isLatest ? (
        <Link className="ghostButton" href={`/runs/${runId}`}>
          <RotateCcw size={15} />
          Latest step
        </Link>
      ) : null}
    </div>
  );
}