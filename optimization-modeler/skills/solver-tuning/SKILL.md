---
name: solver-tuning
description: Configure solver parameters, interpret solve logs, diagnose numerical issues, and benchmark formulation alternatives
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Solver Tuning & Diagnostics

## When to Use
When the user's model solves too slowly, produces unexpected results, or has numerical issues.

## Instructions

### Solver Log Interpretation

Key metrics to extract from any solver log:
- **Presolve reductions**: variables/constraints removed — if low, the formulation may have redundancy
- **Root LP relaxation**: objective value and time — weak relaxation = slow MIP
- **Root gap**: (incumbent - relaxation) / incumbent — >50% means the formulation needs strengthening
- **Node count**: total branch-and-bound nodes — >100K suggests reformulation, not parameter tuning
- **Simplex iterations per node**: >1000 means LP relaxations are expensive

### Common Solver Parameters

| Parameter | Gurobi | HiGHS | CPLEX | When to Change |
|-----------|--------|-------|-------|----------------|
| MIP gap tolerance | `MIPGap` | `mip_rel_gap` | `epgap` | Accept near-optimal faster |
| Time limit | `TimeLimit` | `time_limit` | `tilim` | Hard budget |
| Threads | `Threads` | `threads` | `threads` | Match available cores |
| Presolve | `Presolve` | `presolve` | `preprocessing_presolve` | Turn off only for debugging |
| Cuts | `Cuts` | — | `mip_cuts` | Aggressive if root gap is large |
| Heuristics | `Heuristics` | — | `mip_strategy_heuristicfreq` | Increase if no incumbent found early |
| Numerical focus | `NumericFocus` | — | `emphasis_numerical` | If solver reports ill-conditioning |

### Diagnosing Slow Solves

```
Is the LP relaxation slow?
├── Yes → Check constraint matrix density, try barrier instead of simplex
│         Check for big-M values creating ill-conditioning
└── No
    ├── Is the root gap large (>20%)?
    │   ├── Yes → Strengthen formulation: tighter bounds, cuts, reformulation
    │   └── No
    │       ├── Many nodes explored but gap not closing?
    │       │   └── Symmetry or weak branching — add symmetry-breaking constraints
    │       └── Few nodes but each is slow?
    │           └── Expensive LP re-solves — try warm-starting, reduce constraint count
```

### Numerical Issues Checklist
1. **Coefficient range**: max/min nonzero ratio should be < 10⁶. Rescale if larger.
2. **Big-M values**: every M should be justified and tight. Loose M = numerical garbage.
3. **Constraint scaling**: ensure RHS values are within 10⁻⁴ to 10⁴ range.
4. **Near-parallel constraints**: cause ill-conditioning. Remove or aggregate.
5. **Fixed variables with wide bounds**: if a variable is effectively fixed, fix it explicitly.

### Benchmarking Formulations
When comparing two formulations of the same problem:
1. Use the **same instance data** and **same solver version**
2. Report: variables, constraints, nonzeros, root relaxation, root gap, nodes, solve time
3. Use geometric mean over multiple instances — arithmetic mean is dominated by outliers
4. Run each formulation 3+ times to account for solver nondeterminism
5. Disable solver cuts and heuristics for a clean comparison of formulation strength
