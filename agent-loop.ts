#!/usr/bin/env node

/**
 * Agent Loop Orchestrator
 *
 * Coordinates a sequence of agents working on code changes.
 * Each agent is loaded from its agent.yaml (single source of truth),
 * and the simplify agent always runs last.
 *
 * Usage:
 *   npx ts-node agent-loop.ts <task> [agents...]
 *   npx ts-node agent-loop.ts "Add user authentication" code-reviewer performance-freak
 *   npx ts-node agent-loop.ts "Optimize data model" data-modeler
 *
 * Default pipeline (if no agents specified):
 *   code-reviewer → performance-freak → simplify
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { subagent } from "@mariozechner/pi-coding-agent";
import { loadAgent } from "./load-agent.js";

interface AgentStep {
  agent: string;
  task?: string;
  output?: string;
  reads?: string[];
  timeout_seconds?: number;
}

/**
 * Register all agents in the pipeline from their agent.yaml files
 */
async function registerAgents(agentNames: string[]): Promise<void> {
  for (const name of agentNames) {
    const dir = resolve(name);
    if (!existsSync(dir)) {
      throw new Error(`Agent directory not found: ${dir}`);
    }
    await loadAgent(dir);
  }
}

/**
 * Build a chain of agents that run sequentially,
 * with the simplify agent always running last after code changes.
 */
function buildAgentChain(userTask: string, agentNames: string[]): AgentStep[] {
  const steps: AgentStep[] = [];

  for (let i = 0; i < agentNames.length; i++) {
    const agent = agentNames[i];
    steps.push({
      agent,
      task:
        i === 0
          ? userTask
          : `Based on the previous agent's work, continue improving the code:\n\n{previous}`,
      output: `${agent}-output.md`,
      reads: i > 0 ? [`${agentNames[i - 1]}-output.md`] : undefined,
      timeout_seconds: 600,
    });
  }

  // Ensure simplify runs last
  if (!agentNames.includes("simplify")) {
    steps.push({
      agent: "simplify",
      task: `Review the code changes made by previous agents and simplify for reuse, quality, and efficiency:\n\n{previous}`,
      reads: [`${agentNames[agentNames.length - 1]}-output.md`],
      output: "simplify-output.md",
      timeout_seconds: 600,
    });
  }

  return steps;
}

/**
 * Run the pipeline
 */
async function run(userTask: string, agentNames: string[]): Promise<void> {
  const allAgents = agentNames.includes("simplify")
    ? agentNames
    : [...agentNames, "simplify"];

  // Register all agents from their agent.yaml files
  await registerAgents(allAgents);

  const chain = buildAgentChain(userTask, agentNames);

  const result = await subagent({ chain });

  console.log("\nPipeline completed.");
  console.log("Outputs:");
  for (const step of chain) {
    console.log(`  ${step.agent} → ${step.output}`);
  }

  return result;
}

// CLI entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx ts-node agent-loop.ts <task> [agent1 agent2 ...]");
    console.error('Example: npx ts-node agent-loop.ts "Improve auth system" code-reviewer');
    process.exit(1);
  }

  const userTask = args[0];
  const specifiedAgents = args.slice(1);
  const pipeline = specifiedAgents.length > 0
    ? specifiedAgents
    : ["code-reviewer", "performance-freak"];

  await run(userTask, pipeline);
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${msg}`);
  process.exit(1);
});
