---
name: equivalence-partitioning
description: Divide inputs into equivalence classes to reduce test cases while maintaining coverage. Use when optimizing test suites or dealing with large input domains.
---

# Equivalence Partitioning Skill

Equivalence Partitioning (EP) is a black-box testing technique that divides input data into groups (partitions) that are expected to be processed similarly, allowing you to test one value from each partition instead of all possible values.

## Core Concept

If one test case from an equivalence class detects a defect, all other test cases from that class would likely detect the same defect. Conversely, if one test case passes, all others in that class should pass.

## When to Use
- Large input domains (too many possible values to test all)
- Numeric ranges
- String formats and patterns
- Sets of valid/invalid values
- Menu selections and dropdown options
- Date ranges and time periods

## Partition Types

### 1. Valid Equivalence Partitions
Values that should be accepted by the system.

**Example**: Age input (1-120)
```json
{
  "valid_partitions": [
    {
      "name": "valid_adult_age",
      "range": "[18, 64]",
      "representative_value": 30,
      "description": "Working age adults"
    },
    {
      "name": "valid_senior_age",
      "range": "[65, 120]",
      "representative_value": 70,
      "description": "Senior citizens"
    }
  ]
}
```

### 2. Invalid Equivalence Partitions
Values that should be rejected by the system.

**Example**: Age input (1-120)
```json
{
  "invalid_partitions": [
    {
      "name": "below_minimum",
      "values": "< 1",
      "representative_value": 0,
      "expected_error": "Age must be positive"
    },
    {
      "name": "above_maximum",
      "values": "> 120",
      "representative_value": 121,
      "expected_error": "Invalid age"
    },
    {
      "name": "non_numeric",
      "values": "letters, symbols",
      "representative_value": "abc",
      "expected_error": "Age must be a number"
    }
  ]
}
```

## Partitioning Guidelines

### By Numeric Range
**Example**: Salary range ($20,000 - $100,000)
```
Valid partitions:
  - $20,000 (minimum)
  - $50,000 (mid-range)
  - $100,000 (maximum)

Invalid partitions:
  - Below $20,000
  - Above $100,000
  - Negative values
  - Non-numeric
```

### By String Format
**Example**: Email address
```
Valid partitions:
  - Standard format: user@domain.com
  - With dots: first.last@domain.com
  - With numbers: user123@domain.com
  - Subdomain: user@mail.domain.com

Invalid partitions:
  - Missing @
  - Missing domain
  - Special characters
  - Empty string
  - Spaces in email
```

### By Set Membership
**Example**: Gender selection
```
Valid partitions:
  - Male
  - Female
  - Other
  - Prefer not to say

Invalid partitions:
  - Any other value
```

### By Data Type
**Example**: Phone number
```
Valid partition: Digits only, 10 digits
Invalid partitions:
  - Letters
  - Special characters
  - Too short (< 10 digits)
  - Too long (> 10 digits)
  - Empty/null
```

## Test Case Selection Strategy

### Strategy 1: One Value Per Partition
Test one representative value from each partition (valid and invalid).

**Example**: Username (4-16 alphanumeric)
```json
{
  "test_cases": [
    {"partition": "valid_min_length", "value": "abcd", "expected": "pass"},
    {"partition": "valid_mid_length", "value": "abc123", "expected": "pass"},
    {"partition": "valid_max_length", "value": "abcd1234567890", "expected": "pass"},
    {"partition": "invalid_too_short", "value": "abc", "expected": "fail"},
    {"partition": "invalid_too_long", "value": "abcd12345678901", "expected": "fail"},
    {"partition": "invalid_special_chars", "value": "abc@123", "expected": "fail"},
    {"partition": "invalid_empty", "value": "", "expected": "fail"}
  ]
}
```

## Combining with Boundary Value Analysis

**Best Practice**: Use Equivalence Partitioning with Boundary Value Analysis for comprehensive coverage.

**Example**: Test score (0-100)

| Partition Type | Partition | Test Values |
|---------------|-----------|-------------|
| Valid | [0, 100] | 0, 1, 50, 99, 100 |
| Invalid | < 0 | -1 |
| Invalid | > 100 | 101 |
| Invalid | Non-numeric | "abc" |

## Output Format

When applying equivalence partitioning:

```json
{
  "variable": "username",
  "specifications": "4-16 alphanumeric characters",
  "equivalence_classes": [
    {
      "class_id": "EP001",
      "type": "valid",
      "description": "Valid minimum length",
      "values": "4 characters",
      "test_value": "abcd"
    },
    {
      "class_id": "EP002",
      "type": "valid",
      "description": "Valid nominal length",
      "values": "8-10 characters",
      "test_value": "abc12345"
    },
    {
      "class_id": "EP003",
      "type": "valid",
      "description": "Valid maximum length",
      "values": "16 characters",
      "test_value": "abcd1234567890"
    },
    {
      "class_id": "EP004",
      "type": "invalid",
      "description": "Below minimum length",
      "values": "< 4 characters",
      "test_value": "abc",
      "expected_error": "Username must be at least 4 characters"
    },
    {
      "class_id": "EP005",
      "type": "invalid",
      "description": "Above maximum length",
      "values": "> 16 characters",
      "test_value": "abcd12345678901",
      "expected_error": "Username must not exceed 16 characters"
    },
    {
      "class_id": "EP006",
      "type": "invalid",
      "description": "Special characters",
      "values": "Contains special chars",
      "test_value": "abc@123",
      "expected_error": "Username must be alphanumeric only"
    }
  ],
  "test_cases": [
    {"id": "TC001", "class": "EP001", "value": "abcd", "expected": "valid"},
    {"id": "TC002", "class": "EP002", "value": "abc12345", "expected": "valid"},
    {"id": "TC003", "class": "EP003", "value": "abcd1234567890", "expected": "valid"},
    {"id": "TC004", "class": "EP004", "value": "abc", "expected": "invalid"},
    {"id": "TC005", "class": "EP005", "value": "abcd12345678901", "expected": "invalid"},
    {"id": "TC006", "class": "EP006", "value": "abc@123", "expected": "invalid"}
  ]
}
```

## Best Practices

1. **DO:**
   - Identify both valid and invalid partitions
   - Consider all input conditions and constraints
   - Choose representative values that are typical for each partition
   - Document the reasoning behind each partition
   - Combine with boundary value analysis for robust testing
   - Review partitions with stakeholders to ensure completeness

2. **DON'T:**
   - Create overlapping partitions
   - Skip invalid partitions (error cases are important!)
   - Forget implicit boundaries or constraints
   - Use only one test case per partition without considering boundaries
   - Ignore edge cases that don't fit neatly into partitions

## Advanced Techniques

### Output Equivalence Partitioning
Test different output ranges, not just inputs.

**Example**: Grade calculation
```
Output partitions:
  - A: 90-100
  - B: 80-89
  - C: 70-79
  - D: 60-69
  - F: 0-59
```

### Dependent Partitions
When one input's valid partitions depend on another.

**Example**: Country and postal code
```
Country: USA → Postal code: 5 digits or ZIP+4
Country: Canada → Postal code: A1A 1A1 format
Country: UK → Postal code: Various UK formats
```
