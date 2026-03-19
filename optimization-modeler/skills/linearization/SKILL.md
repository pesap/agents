---
name: linearization
description: Linearize nonlinear optimization terms using big-M, McCormick, piecewise-linear, SOS, and conic reformulations while preserving solution quality
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Linearization Techniques

## When to Use
When the user has nonlinear terms in their optimization model and needs a linear (or conic) reformulation for MIP/LP solvers.

## Instructions

### Decision Tree: Which Technique to Use

```
Nonlinear term identified
├── Bilinear (x * y)?
│   ├── Both continuous → McCormick envelopes
│   ├── One binary → exact linearization (big-M or indicator)
│   └── Both binary → standard product linearization
├── Product of binary and continuous (z * x)?
│   └── Exact: big-M or indicator constraints
├── Piecewise-linear or lookup table?
│   ├── Few breakpoints → SOS2 or incremental
│   └── Many breakpoints → logarithmic formulation (log₂(n) binaries)
├── Absolute value |x|?
│   └── Split: x = x⁺ - x⁻, |x| = x⁺ + x⁻
├── Min/max?
│   └── Epigraph reformulation with big-M or indicator
├── Quadratic (convex)?
│   └── SOCP reformulation (no linearization needed)
└── General nonlinear?
    └── Piecewise-linear approximation with error bounds
```

### Technique Details

**Big-M (Binary × Continuous):**
```
z ∈ {0,1}, x ∈ [0, U]
Linearize y = z * x:
  y ≤ U * z          (y = 0 when z = 0)
  y ≥ 0
  y ≤ x              (y = x when z = 1)
  y ≥ x - U*(1 - z)  (y = x when z = 1)
```
**Critical**: U must be the tightest valid upper bound on x. Compute from data, never guess.

**McCormick Envelopes (Continuous × Continuous):**
```
x ∈ [xL, xU], y ∈ [yL, yU]
Linearize w = x * y:
  w ≥ xL*y + x*yL - xL*yL
  w ≥ xU*y + x*yU - xU*yU
  w ≤ xL*y + x*yU - xL*yU
  w ≤ xU*y + x*yL - xU*yL
```
Quality depends on bound tightness. Tighten bounds first, then apply McCormick.

**Piecewise-Linear (SOS2):**
```
Approximate f(x) over breakpoints x₁, ..., xₙ:
  x = Σᵢ λᵢ * xᵢ
  f(x) ≈ Σᵢ λᵢ * f(xᵢ)
  Σᵢ λᵢ = 1
  λ ∈ SOS2  (at most 2 adjacent λᵢ nonzero)
```

**Logarithmic Formulation:**
When n breakpoints would need n-1 SOS2 binaries, use log₂(n) binaries instead. Reduces model size for fine-grained approximations.

### Error Bounds
For every linearization, report:
- **Exact** if the reformulation is equivalent (binary × continuous, product of binaries)
- **Approximation error** = max|f(x) - f̃(x)| over the domain, computed from breakpoint spacing
- **Relaxation gap** introduced by McCormick = (xU - xL) * (yU - yL) / 4 at midpoint

### Validation
After linearizing:
1. Solve the original (nonlinear) on a small instance
2. Solve the linearized version on the same instance
3. Compare objective values — the gap should match the predicted error bound
4. Check that the linearized solution is feasible in the original
