# Harness Compliance Experiment

Testing what makes agents follow the pesap harness consistently.

## Quick Start

```bash
cd ~/dev/agents
pi
```

Then in pi:
```
/skill:autoresearch-create
```

When prompted, provide:
```
Goal: Find the most effective method to ensure agents follow harness compliance (Result/Confidence, Preflight/Postflight, tool descriptions, skills, validation)

Command: ./autoresearch.sh

Primary metric: compliance_score percent higher

Files in scope: agent/AGENTS.md, agent/skills/, experiments/, commands/

Constraints: Test 3 variants; reset between tests; measure via measure-compliance.sh
```

## Variants

| Variant | What | Expected outcome |
|---------|------|------------------|
| **baseline** | Current AGENTS.md | ~40-60% compliance |
| **enhanced** | AGENTS.md + mandatory checklist | ~70-80% compliance |
| **harness-gate** | Pre-flight skill gate | ~85-95% compliance |

## Metrics (8 checks)

1. Result line present (`Result: success|partial|failed`)
2. Confidence line present (`Confidence: 0..1`)
3. Preflight before mutations
4. Postflight after mutations
5. Tool call descriptions
6. Skill usage indicated
7. Validation mentioned
8. Session/hook awareness

## Test scenarios

1. **simple_edit**: Add comment to README.md (tests mutations)
2. **debug_style**: Check file exists + suggest improvement (tests reads)
3. **feature_request**: Create new file (tests mutations)

## Files

- `autoresearch.md` - Session document with experiment spec
- `autoresearch.sh` - Benchmark runner
- `autoresearch.checks.sh` - Backpressure checks
- `measure-compliance.sh` - Compliance scoring
- `experiments/enhanced-agents.md` - Variant 2
- `experiments/skills/harness-gate/` - Variant 3

## Dashboard

During experiment:
- `Ctrl+X` - Toggle dashboard
- `Ctrl+Shift+X` - Fullscreen overlay
- `/autoresearch export` - Browser dashboard

## Finalizing

After experiments complete:
```
/skill:autoresearch-finalize
```

This groups successful experiments into reviewable branches.
