import type { DriverDecision } from "@tracepilot/core";
import type { AgentDriver, AgentDriverContext } from "./agent-driver.js";

export class ScriptedDriver implements AgentDriver {
  private cursor = 0;

  constructor(private readonly decisions: DriverDecision[]) {}

  async decide(_context: AgentDriverContext): Promise<DriverDecision> {
    const decision = this.decisions[this.cursor];
    this.cursor += 1;

    return (
      decision ?? {
        action: { kind: "finish", summary: "Scripted driver exhausted decisions." },
        reasoning: "No scripted decisions remain.",
        confidence: 1
      }
    );
  }
}

