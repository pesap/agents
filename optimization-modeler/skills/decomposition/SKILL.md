---
name: decomposition
description: Decompose large optimization problems into smaller testable subproblems using Benders, Dantzig-Wolfe, Lagrangian relaxation, ADMM, and hierarchical strategies
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Problem Decomposition

## When to Use
When the user has a large optimization problem that is too slow to solve monolithically, or when the problem has natural block structure that can be exploited.

## Instructions

### Identifying Decomposable Structure

Before choosing a method, analyze the constraint matrix structure:

1. **Block-diagonal with linking constraints** → Benders or Lagrangian relaxation
   ```
   [A₁  0   0 ] [x₁]   [b₁]
   [ 0  A₂  0 ] [x₂] ≤ [b₂]   ← independent blocks
   [ 0   0  A₃] [x₃]   [b₃]
   [D₁  D₂  D₃] [  ]   [d ]   ← linking constraints
   ```

2. **Block-diagonal with linking variables** → Dantzig-Wolfe / column generation
   ```
   [B  B  B ] [y ]   [c ]   ← linking variables
   [A₁ 0  0 ] [x₁] ≤ [b₁]   ← independent blocks
   [ 0  A₂ 0] [x₂]   [b₂]
   ```

3. **Temporal stages** → Stochastic programming / progressive hedging
   - Stage 1 decisions (here-and-now) → Stage 2 recourse (wait-and-see)

4. **Replicated structure with consensus** → ADMM
   - Multiple agents/regions that must agree on shared variables

### Method Selection

| Structure | Method | When to Prefer |
|-----------|--------|----------------|
| Few linking constraints, many subproblems | **Benders** | Continuous recourse, complicating variables are few |
| Few linking variables, many subproblems | **Dantzig-Wolfe** | Subproblems have special structure (knapsack, shortest path) |
| Separable objective, coupling constraints | **Lagrangian relaxation** | Need bounds fast, subproblems easy to solve |
| Consensus across copies | **ADMM** | Distributed solving, convex subproblems |
| Temporal stages with uncertainty | **Progressive hedging** | Scenario-based stochastic programs |
| Hierarchical decisions | **Fix-and-relax / fix-and-optimize** | MIPs with time-indexed structure |

### Benders Decomposition Template
```
Master problem (complicating variables y):
  min  cᵀy + η
  s.t. η ≥ optimality cuts (accumulated)
       feasibility cuts (accumulated)
       y ∈ Y

Subproblem (given ŷ from master):
  min  fᵀx
  s.t. Ax ≤ b - Dŷ
       x ≥ 0

Loop:
  1. Solve master → ŷ, lower bound = master objective
  2. Solve sub(ŷ) → x*, dual π*
  3. If sub infeasible: add feasibility cut (πᵀ(b - Dŷ) ≤ 0)
  4. If sub feasible: add optimality cut (η ≥ πᵀ(b - Dy))
  5. Upper bound = cᵀŷ + sub objective
  6. Stop when gap < ε
```

### Decomposition Validation Strategy

**This is critical** — test each piece independently:

1. **Subproblem unit test**: Fix the complicating variables to known values, solve each subproblem alone, verify feasibility and objective
2. **Master problem test**: With a few manually-generated cuts, verify the master selects the right complicating variables
3. **Convergence test**: On a tiny instance (solvable monolithically), run decomposition and verify:
   - Lower bound ≤ optimal ≤ upper bound at every iteration
   - Bounds converge to the monolithic optimal
   - Number of iterations is reasonable
4. **Scaling test**: Increase problem size progressively, verify solve time grows sublinearly vs. monolithic

### Anti-Patterns to Avoid
- Decomposing a problem with dense coupling — decomposition adds overhead with no benefit
- Using Benders when subproblems are MIPs (need integer Benders or Lagrangian instead)
- Forgetting feasibility cuts — the algorithm may cycle or claim infeasibility incorrectly
- Not warming starting the master with known feasible solutions
