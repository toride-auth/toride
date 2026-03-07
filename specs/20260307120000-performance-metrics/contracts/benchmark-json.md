# Contract: Benchmark Result JSON Artifact

## Schema

The CI artifact uploaded after each benchmark run follows this structure:

```json
{
  "commit": "abc1234def5678...",
  "timestamp": "2026-03-07T12:00:00.000Z",
  "entries": [
    {
      "operation": "can",
      "tier": "small",
      "median": 1234.56,
      "mean": 1300.00,
      "hz": 812345.67,
      "samples": 10000,
      "min": 1100.00,
      "max": 2500.00,
      "p75": 1400.00,
      "p99": 2100.00
    }
  ]
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `commit` | string | Full git commit SHA |
| `timestamp` | string | ISO 8601 timestamp of the benchmark run |
| `entries` | array | One entry per operation-tier combination (27 total) |
| `entries[].operation` | string | One of: `can`, `canBatch`, `permittedActions`, `buildConstraints`, `explain`, `snapshot`, `canField`, `permittedFields`, `resolvedRoles` |
| `entries[].tier` | string | One of: `small`, `medium`, `large` |
| `entries[].median` | number | Median execution time in nanoseconds |
| `entries[].mean` | number | Mean execution time in nanoseconds |
| `entries[].hz` | number | Operations per second |
| `entries[].samples` | number | Number of iterations executed |
| `entries[].min` | number | Minimum execution time in nanoseconds |
| `entries[].max` | number | Maximum execution time in nanoseconds |
| `entries[].p75` | number | 75th percentile execution time in nanoseconds |
| `entries[].p99` | number | 99th percentile execution time in nanoseconds |

## Naming Convention

Benchmark names in vitest bench files follow the pattern: `{operation} - {tier}`

Examples: `can - small`, `canBatch - medium`, `buildConstraints - large`

The comparison script parses this pattern to extract `operation` and `tier`.
