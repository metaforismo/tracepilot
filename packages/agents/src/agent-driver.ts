import type { DriverDecision, Observation, TaskSpec, TraceStep } from "@tracepilot/core";

export type AgentDriverContext = {
  task: TaskSpec;
  observation: Observation;
  steps: TraceStep[];
};

export type AgentDriver = {
  decide(context: AgentDriverContext): Promise<DriverDecision>;
};

