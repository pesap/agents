---
name: problem-simplification
description: Analyze optimization formulations to eliminate redundancy, tighten bounds, fix variables, aggregate constraints, and break symmetry
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Problem Simplification

## When to Use
When the user has an optimization model that is too large, too slow, or more complex than necessary.

## Instructions

### Simplification Checklist
Work through these in order on every formulation:

1. **Variable Fixing** — Can any variables be determined from the data without solving?
   - Check parameter values: if `capacity[i] = 0`, fix `x[i] = 0`
   - Check logical implications: if a resource is unavailable, remove its variables entirely

2. **Bound Tightening** — Are the variable bounds as tight as possible?
   - Derive implied bounds from constraints (e.g., `x + y ≤ 10, x ≥ 0, y ≥ 0` → `x ≤ 10, y ≤ 10`)
   - Propagate bounds through the constraint matrix
   - Tighter bounds = smaller feasible region = faster branching

3. **Redundant Constraint Removal** — Do any constraints imply others?
   - If `x ≤ 5` and `x ≤ 10` both exist, drop the weaker one
   - Check for constraints dominated by combinations of others
   - Use LP dual information: zero-dual constraints at optimality are candidates

4. **Constraint Aggregation** — Can groups of similar constraints be combined?
   - Knapsack-style aggregation: sum of similar constraints
   - Time-period aggregation: coarsen temporal resolution where detail isn't needed
   - Spatial aggregation: merge nodes in a network that behave identically

5. **Symmetry Breaking** — Does the formulation have equivalent solutions?
   - Add ordering constraints: `x[1] ≥ x[2] ≥ ... ≥ x[n]` for identical items
   - Fix one representative from each symmetry class
   - Use orbital fixing or isomorphism detection for complex symmetry

6. **Probing** — What can we learn from fixing variables to their bounds?
   - Fix a binary to 0 or 1 — do other variables become fixed?
   - Does fixing reveal infeasibility? Then the opposite value is implied
   - Probing tightens the LP relaxation

### Output Format
For each simplification applied, show:
- **Before**: the original formulation fragment
- **After**: the simplified version
- **Why valid**: proof or argument that the optimal solution is preserved
- **Impact**: estimated reduction in variables/constraints
