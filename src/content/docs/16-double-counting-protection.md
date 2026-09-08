# 16. Double-Counting Protection

GRI v1.2 uses two deterministic concentration controls so repeated publication does not multiply one underlying development into artificial risk weight.

## Source cap

Within each domain, all eligible observations from one stable source share a maximum total evidence budget of `1.0`.

```text
many observations from one publisher
        ↓
source raw weight
        ↓
source effective weight = min(1.0, source raw weight)
```

## Story cap

After source capping, observations are grouped into immutable story clusters representing the same underlying development.

The story evidence budget is based on the strongest constituent source total and is capped at `1.0`. Member observations share that budget proportionally.

```text
articles
  ↓
source cap
  ↓
story assignment
  ↓
story cap
  ↓
effective evidence weight
```

This means several publishers repeating one story cannot create several independent risk budgets merely through repetition.