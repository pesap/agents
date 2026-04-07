---
name: property-based-testing
description: Write property-based tests using Hypothesis with pytest, including strategies, shrinking, stateful testing, and integrating with parametrize
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Property-Based Testing

## When to Use
When example-based tests can't cover the input space. When you need to find edge cases a human wouldn't think of. When testing serialization round-trips, mathematical properties, parsers, validators, or any function where "this property should hold for ALL valid inputs."

## Background

Instead of writing `assert f(3) == 9`, you write "for all integers x, `f(x) >= 0`." Hypothesis generates hundreds of random inputs, finds a failing case, then **shrinks** it to the smallest possible reproducer. This finds bugs that example-based tests miss.

## Instructions

1. **Install Hypothesis**:

```bash
uv add --dev hypothesis
```

2. **Basic property test** — Define what should be true for all inputs:

```python
from hypothesis import given
import hypothesis.strategies as st

@given(st.lists(st.integers()))
def test_sort_preserves_length(xs):
    assert len(sorted(xs)) == len(xs)

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs):
    assert sorted(sorted(xs)) == sorted(xs)

@given(st.lists(st.integers()))
def test_sort_produces_ordered_output(xs):
    result = sorted(xs)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1]
```

3. **Common strategies** — Building blocks for generating test data:

```python
# Primitives
st.integers()                          # any int
st.integers(min_value=0, max_value=100)  # bounded
st.floats(allow_nan=False)             # floats without NaN
st.text()                              # arbitrary unicode
st.text(alphabet="abc", min_size=1)    # constrained text
st.booleans()
st.none()
st.binary()                            # bytes

# Collections
st.lists(st.integers())                # list of ints
st.lists(st.integers(), min_size=1)    # non-empty
st.dictionaries(st.text(), st.integers())
st.tuples(st.integers(), st.text())    # fixed structure
st.frozensets(st.integers())

# Combinators
st.one_of(st.integers(), st.text())    # union type
st.integers() | st.none()              # shorthand for one_of
st.sampled_from(["red", "green", "blue"])  # enum-like
```

4. **Custom strategies with `@composite`** — Build domain objects:

```python
from hypothesis import given
from hypothesis.strategies import composite

@composite
def user_strategy(draw):
    name = draw(st.text(min_size=1, max_size=50))
    age = draw(st.integers(min_value=0, max_value=150))
    email = draw(st.emails())
    return User(name=name, age=age, email=email)

@given(user_strategy())
def test_user_serialization_roundtrip(user):
    serialized = user.to_json()
    deserialized = User.from_json(serialized)
    assert deserialized == user
```

5. **Round-trip / encode-decode properties** — The most common and valuable pattern:

```python
@given(st.binary())
def test_compress_decompress_roundtrip(data):
    assert decompress(compress(data)) == data

@given(st.dictionaries(st.text(), st.integers()))
def test_json_roundtrip(d):
    assert json.loads(json.dumps(d)) == d
```

6. **Shrinking** — When Hypothesis finds a failure, it automatically shrinks the input to the minimal reproducer. This is the killer feature. A failing list of 200 elements might shrink to `[0, 1]`.

To reproduce a specific failure, Hypothesis prints the seed:

```python
# Reproduce with:
@given(st.lists(st.integers()))
@settings(database=None)  # optional: disable the example database
def test_something(xs):
    ...

# Or use @example to lock in a known case:
from hypothesis import example

@given(st.integers())
@example(0)       # always test zero
@example(-1)      # always test negative
def test_abs_is_non_negative(n):
    assert abs(n) >= 0
```

7. **Settings and profiles** — Control how hard Hypothesis tries:

```python
from hypothesis import settings, HealthCheck

# Per-test settings
@settings(max_examples=500, deadline=None)
@given(st.text())
def test_expensive_property(s):
    ...

# Profiles for CI vs local
settings.register_profile("ci", max_examples=1000)
settings.register_profile("dev", max_examples=50)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
```

Put the profile loader in `conftest.py`:

```python
# tests/conftest.py
from hypothesis import settings
settings.register_profile("ci", max_examples=1000, deadline=None)
settings.register_profile("dev", max_examples=100)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
```

8. **Stateful testing** — Test stateful systems (APIs, databases) by generating sequences of operations:

```python
from hypothesis.stateful import RuleBasedStateMachine, rule, initialize

class ShoppingCartMachine(RuleBasedStateMachine):
    @initialize()
    def create_cart(self):
        self.cart = ShoppingCart()

    @rule(item=st.text(min_size=1), qty=st.integers(min_value=1, max_value=10))
    def add_item(self, item, qty):
        self.cart.add(item, qty)
        assert self.cart.count(item) >= qty

    @rule(item=st.text(min_size=1))
    def remove_item(self, item):
        self.cart.remove(item)
        assert self.cart.count(item) == 0

    @rule()
    def clear(self):
        self.cart.clear()
        assert self.cart.total_items() == 0

TestShoppingCart = ShoppingCartMachine.TestCase
```

9. **Combine with parametrize** — Use Hypothesis for the fuzz, parametrize for the modes:

```python
@pytest.mark.parametrize("encoding", ["utf-8", "ascii", "latin-1"])
@given(st.text())
def test_encode_decode_roundtrip(encoding, s):
    try:
        encoded = s.encode(encoding)
        assert encoded.decode(encoding) == s
    except UnicodeEncodeError:
        pass  # some text can't encode in ascii/latin-1, that's fine
```

## When NOT to Use
- Pure CRUD with no logic (property-based adds noise, not value)
- When the "property" is just re-implementing the function under test
- When tests need deterministic, reproducible examples for documentation
