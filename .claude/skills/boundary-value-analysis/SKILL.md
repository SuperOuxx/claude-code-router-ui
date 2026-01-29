---
name: boundary-value-analysis
description: Apply boundary value analysis to identify edge cases. Use when testing inputs with numeric ranges, string lengths, array sizes, or any domain with defined limits.
---

# Boundary Value Analysis Skill

Boundary Value Analysis (BVA) is a black-box testing technique focused on testing at the boundaries of input domains, as errors frequently occur at these edges.

## When to Use
- Testing numeric inputs with min/max limits
- Validating string length constraints
- Checking array/collection size limits
- Testing date/time boundaries
- File size or upload limits
- Any domain with explicit boundaries

## Core Concept

Errors are most likely to occur at:
- **Minimum boundaries**: Lower edge of valid range
- **Maximum boundaries**: Upper edge of valid range
- **Just below boundaries**: First invalid value below min
- **Just above boundaries**: First invalid value above max

## Test Values Selection

For a range **[min, max]**, test these values:
```
min - 1  (below minimum - should fail)
min      (at minimum - should pass)
min + 1  (just above minimum - should pass)
max - 1  (just below maximum - should pass)
max      (at maximum - should pass)
max + 1  (above maximum - should fail)
```

## Types of Boundaries

### 1. Numeric Boundaries
**Example**: Age input (18-60 years)
```json
{
  "test_values": [
    {"value": 17, "type": "below_min", "expected": "error"},
    {"value": 18, "type": "min_boundary", "expected": "valid"},
    {"value": 19, "type": "above_min", "expected": "valid"},
    {"value": 59, "type": "below_max", "expected": "valid"},
    {"value": 60, "type": "max_boundary", "expected": "valid"},
    {"value": 61, "type": "above_max", "expected": "error"}
  ]
}
```

### 2. String Length Boundaries
**Example**: Username (4-16 characters)
```json
{
  "test_values": [
    {"value": "abc", "length": 3, "type": "below_min", "expected": "error"},
    {"value": "abcd", "length": 4, "type": "min_boundary", "expected": "valid"},
    {"value": "abcde", "length": 5, "type": "nominal", "expected": "valid"},
    {"value": "abcdefghijklmnop", "length": 16, "type": "max_boundary", "expected": "valid"},
    {"value": "abcdefghijklmnopq", "length": 17, "type": "above_max", "expected": "error"}
  ]
}
```

### 3. Array/Collection Boundaries
**Example**: Shopping cart (1-10 items)
```json
{
  "test_values": [
    {"value": 0, "type": "empty", "expected": "error"},
    {"value": 1, "type": "min_boundary", "expected": "valid"},
    {"value": 5, "type": "nominal", "expected": "valid"},
    {"value": 10, "type": "max_boundary", "expected": "valid"},
    {"value": 11, "type": "above_max", "expected": "error"}
  ]
}
```

### 4. Date/Time Boundaries
**Example**: Event registration (2025-01-01 to 2025-12-31)
```json
{
  "test_values": [
    {"value": "2024-12-31", "type": "below_min", "expected": "error"},
    {"value": "2025-01-01", "type": "min_boundary", "expected": "valid"},
    {"value": "2025-07-01", "type": "nominal", "expected": "valid"},
    {"value": "2025-12-31", "type": "max_boundary", "expected": "valid"},
    {"value": "2026-01-01", "type": "above_max", "expected": "error"}
  ]
}
```

## Special Boundary Cases

### Single-Sided Boundaries
**Example**: Password must be at least 8 characters
```
Test: 7, 8, 9 characters
```

### Compound Boundaries
**Example**: 1 ≤ x ≤ 100 AND 10 ≤ y ≤ 50
```
Test combinations:
- (x=1, y=10)  - min/min
- (x=100, y=50) - max/max
- (x=1, y=50)  - min/max
- (x=100, y=10) - max/min
```

### Common Special Values
- **Zero**: 0, -0, +0
- **One**: 1, -1
- **Null/Empty**: null, undefined, ""
- **Max values**: MAX_INT, MAX_SAFE_INTEGER
- **Floating point precision**: 0.1 + 0.2 ≠ 0.3

## Application Process

1. **Identify all input variables** with boundaries
2. **Extract boundary specifications** from requirements
3. **Determine boundary values** for each variable
4. **Create test cases** for each boundary value
5. **Verify expected behavior** at each boundary

## Best Practices

- Test not only at boundaries but also just beyond them
- Consider implicit boundaries (array indices, database limits)
- Test both single and compound boundaries
- Include invalid boundary values
- Document assumptions about boundary definitions
- Combine with equivalence partitioning for comprehensive coverage
