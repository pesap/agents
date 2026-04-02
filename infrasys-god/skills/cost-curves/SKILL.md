---
name: cost-curves
description: Model production costs with FunctionData, ValueCurves, CostCurves, and FuelCurves. Convert between input-output, incremental, and average rate representations.
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Cost Curves

## When to Use
When the user needs to model production variable costs, fuel curves, or convert between cost function representations (input-output, incremental, average rate).

## Instructions

### Architecture Overview

```
FunctionData (base)
├── LinearFunctionData         # f(x) = mx + c
├── QuadraticFunctionData      # f(x) = ax² + bx + c
├── PiecewiseLinearData        # List of (x,y) points
└── PiecewiseStepData          # x-endpoints + y-segments

ValueCurve (base)
├── InputOutputCurve[T]        # y = f(x)       (production -> cost)
├── IncrementalCurve[T]        # y = f'(x)      (production -> marginal cost)
└── AverageRateCurve[T]        # y = f(x)/x     (production -> avg cost rate)

ProductionVariableCostCurve (base)
├── CostCurve                  # Cost in currency ($/hr)
└── FuelCurve                  # Cost in fuel units (MBTU/hr) + fuel_cost
```

### FunctionData Types

```python
from infrasys.function_data import (
    LinearFunctionData,
    QuadraticFunctionData,
    PiecewiseLinearData,
    PiecewiseStepData,
    XYCoords,
)

# Linear: f(x) = 5x + 10
linear = LinearFunctionData(proportional_term=5.0, constant_term=10.0)

# Quadratic: f(x) = 0.01x² + 5x + 10
quadratic = QuadraticFunctionData(
    quadratic_term=0.01, proportional_term=5.0, constant_term=10.0
)

# Piecewise linear: defined by (x,y) points
pwl = PiecewiseLinearData(points=[
    XYCoords(x=0.0, y=0.0),
    XYCoords(x=100.0, y=500.0),
    XYCoords(x=200.0, y=1200.0),
    XYCoords(x=300.0, y=2100.0),
])
# x-coords must be ascending, minimum 2 points

# Piecewise step: x-endpoints + segment y-values
pws = PiecewiseStepData(
    x_coords=[0.0, 100.0, 200.0, 300.0],
    y_coords=[5.0, 7.0, 10.0],  # One fewer than x_coords
)
```

### ValueCurves

ValueCurves wrap FunctionData with physical meaning:

```python
from infrasys.value_curves import (
    InputOutputCurve,
    IncrementalCurve,
    AverageRateCurve,
    LinearCurve,
)

# Input-output: production (MW) -> cost ($/hr) or fuel (MBTU/hr)
io_curve = InputOutputCurve(
    function_data=QuadraticFunctionData(
        quadratic_term=0.01, proportional_term=5.0, constant_term=10.0
    )
)

# Shortcut for linear input-output
io_linear = LinearCurve(proportional_term=5.0, constant_term=10.0)
io_zero = LinearCurve()  # Both terms default to 0.0

# Incremental (marginal): production (MW) -> marginal cost ($/MWh)
inc_curve = IncrementalCurve(
    function_data=LinearFunctionData(proportional_term=0.02, constant_term=5.0),
    initial_input=10.0,  # f(x) at the least x where function is defined
)

# Average rate: production (MW) -> average cost ($/MWh)
avg_curve = AverageRateCurve(
    function_data=PiecewiseStepData(
        x_coords=[50.0, 100.0, 200.0],
        y_coords=[5.0, 7.5],
    ),
    initial_input=250.0,
)
```

### Conversions Between Representations

IncrementalCurve and AverageRateCurve can convert to InputOutputCurve:

```python
# Incremental -> InputOutput
inc = IncrementalCurve(
    function_data=LinearFunctionData(proportional_term=0.02, constant_term=5.0),
    initial_input=10.0,
)
io = inc.to_input_output()
# If proportional_term == 0: produces LinearFunctionData
# If proportional_term != 0: produces QuadraticFunctionData

# Incremental with PiecewiseStep -> InputOutput with PiecewiseLinear
inc_pw = IncrementalCurve(
    function_data=PiecewiseStepData(x_coords=[0, 100, 200], y_coords=[5.0, 7.0]),
    initial_input=0.0,
)
io_pw = inc_pw.to_input_output()
# Uses running_sum to integrate step function into piecewise linear

# Average rate -> InputOutput (same logic)
avg = AverageRateCurve(
    function_data=LinearFunctionData(proportional_term=0.01, constant_term=5.0),
    initial_input=10.0,
)
io_avg = avg.to_input_output()
```

**important:** `initial_input` must be set for conversion. If `None`, raises `ISOperationNotAllowed`.

### CostCurve and FuelCurve

These are the top-level cost representations used on generator components:

```python
from infrasys.cost_curves import CostCurve, FuelCurve, UnitSystem

# CostCurve: direct cost in currency
cost = CostCurve(
    value_curve=InputOutputCurve(
        function_data=QuadraticFunctionData(
            quadratic_term=0.001, proportional_term=20.0, constant_term=500.0
        )
    ),
    power_units=UnitSystem.NATURAL_UNITS,
    vom_cost=LinearCurve(2.0),  # Variable O&M cost
)

# FuelCurve: cost in fuel units with conversion factor
fuel = FuelCurve(
    value_curve=InputOutputCurve(
        function_data=PiecewiseLinearData(points=[
            XYCoords(x=50.0, y=300.0),
            XYCoords(x=100.0, y=700.0),
            XYCoords(x=200.0, y=1600.0),
        ])
    ),
    power_units=UnitSystem.NATURAL_UNITS,
    fuel_cost=3.5,  # $/MBTU or key to time series
    vom_cost=LinearCurve(1.5),
    startup_fuel_offtake=LinearCurve(50.0),
)
```

### UnitSystem

```python
from infrasys.cost_curves import UnitSystem

UnitSystem.NATURAL_UNITS  # MW (most common)
UnitSystem.SYSTEM_BASE    # Per-unit on system base
UnitSystem.DEVICE_BASE    # Per-unit on device base
```

### Using Cost Curves on Components

```python
from typing import Annotated
from pydantic import Field
from infrasys import Component
from infrasys.cost_curves import CostCurve, FuelCurve

class ThermalGenerator(Component):
    active_power: Annotated[float, Field(ge=0)]
    rating: Annotated[float, Field(ge=0)]
    bus: "Bus"
    available: bool
    operation_cost: CostCurve | FuelCurve | None = None

gen = ThermalGenerator(
    name="coal-unit-1",
    active_power=150.0,
    rating=200.0,
    bus=bus,
    available=True,
    operation_cost=CostCurve(
        value_curve=LinearCurve(25.0, 100.0),
        power_units=UnitSystem.NATURAL_UNITS,
    ),
)
```

### Validation

PiecewiseLinearData and PiecewiseStepData validate their inputs:
- x-coordinates must be ascending
- Minimum 2 x-coordinates
- PiecewiseStepData: y_coords must have exactly len(x_coords) - 1 elements
- First x-coordinate can be NaN (for undefined lower bound)
