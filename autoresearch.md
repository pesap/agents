# Harness Compliance Experiment

**Objective**: Determine the most effective method to ensure pi agents follow the pesap-agent harness consistently.

**Primary metric**: Compliance score (0-100%) — measured by checking agent outputs for required harness elements.

**What "following the harness" means**:
1. Includes `Result: success|partial|failed` in final response
2. Includes `Confidence: 0..1` in final response  
3. Includes `Preflight:` line before mutations (when applicable)
4. Includes `Postflight:` verification line after mutations
5. Includes tool call descriptions before meaningful tool calls
6. Uses appropriate skills for the task type
7. Runs validation checks and reports results
8. Ends sessions with hook teardown summary

**Experiment segments**:

### Segment 1: Baseline (current AGENTS.md only)
Test agent behavior with current minimal AGENTS.md

### Segment 2: Enhanced AGENTS.md  
Add explicit mandatory compliance checklist to AGENTS.md

### Segment 3: Pre-flight skill gate
Add a "harness-gate" skill that must be loaded before any work

### Segment 4: Workflow-level injection
Modify workflow prompts to include compliance requirements

**Test tasks for each segment**:
- Task A: Simple file edit (test Postflight, tool descriptions)
- Task B: Debug workflow (test Result/Confidence, skill usage)
- Task C: Feature request (test Preflight, validation, hooks)

**Files in scope**:
- agent/AGENTS.md
- agent/skills/
- agent/skillflows/
- commands/

**Success criteria**:
- Compliance score >90% consistently
- Agent self-corrects when reminded
- Minimal friction to productive work
