# Optimization Formulation Quick Reference

## Standard Form
```
min  cᵀx
s.t. Ax ≤ b
     x ≥ 0
     xᵢ ∈ ℤ  for i ∈ I (integer variables)
```

## Linearization Cheat Sheet

| Nonlinear Term | Technique | Exact? |
|---------------|-----------|--------|
| binary × continuous (z·x) | Big-M with tight bounds | Yes |
| binary × binary (z₁·z₂) | w ≤ z₁, w ≤ z₂, w ≥ z₁+z₂-1 | Yes |
| continuous × continuous | McCormick envelopes | Relaxation |
| |x| | x⁺ - x⁻ split | Yes (with objective trick) |
| max(x₁,...,xₙ) | Epigraph: t ≥ xᵢ ∀i | Yes |
| min(x₁,...,xₙ) | Hypograph: t ≤ xᵢ + M(1-zᵢ), Σzᵢ=1 | Yes |
| Piecewise-linear f(x) | SOS2 / incremental / logarithmic | Exact at breakpoints |
| ‖x‖₂ ≤ t | SOCP constraint | Yes (conic) |
| x² ≤ t·s | Rotated SOC | Yes (conic) |

## Decomposition Decision Matrix

| Coupling Type | Method | Convergence |
|--------------|--------|-------------|
| Linking constraints (few) | Benders | Finite (LP sub) |
| Linking variables (few) | Dantzig-Wolfe | Finite |
| General coupling | Lagrangian relaxation | Subgradient (slow) |
| Consensus | ADMM | Linear (convex) |
| Temporal stages | Progressive hedging | Scenario-dependent |

## Model Strength Hierarchy
```
Strongest (tightest LP relaxation, fewest nodes)
  ↑ Ideal formulation (convex hull)
  ↑ Extended formulations (extra variables)
  ↑ Lifted inequalities / cutting planes
  ↑ Disaggregated constraints
  ↑ Aggregated constraints
  ↓ Weakest (large gap, many nodes)
```

## Complexity Red Flags
- More binary variables than necessary (check if some can be continuous)
- Big-M > 10⁶ (tighten bounds or use indicator constraints)
- Symmetric solutions (add ordering or fix representatives)
- Dense constraint matrix (exploit sparsity with decomposition)
- Redundant constraints (presolve should catch these, but verify)
