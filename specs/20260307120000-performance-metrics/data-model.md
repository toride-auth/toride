# Data Model: Continuous Performance Metrics

## Entities

### BenchmarkResult

The normalized output of a single benchmark run (all operations across all tiers).

```typescript
interface BenchmarkResult {
  commit: string;          // Git commit SHA
  timestamp: string;       // ISO 8601 timestamp
  entries: BenchmarkEntry[];
}

interface BenchmarkEntry {
  operation: string;       // "can" | "canBatch" | "permittedActions" | "buildConstraints" | "explain" | "snapshot" | "canField" | "permittedFields" | "resolvedRoles"
  tier: string;            // "small" | "medium" | "large"
  median: number;          // Median time per operation in nanoseconds
  mean: number;            // Mean time per operation in nanoseconds
  hz: number;              // Operations per second
  samples: number;         // Number of iterations
  min: number;             // Minimum time
  max: number;             // Maximum time
  p75: number;             // 75th percentile
  p99: number;             // 99th percentile
}
```

### ComparisonReport

The output of comparing PR results against baseline results.

```typescript
interface ComparisonReport {
  baselineCommit: string;
  prCommit: string;
  timestamp: string;
  threshold: number;       // e.g., 0.20 (20%)
  hasRegression: boolean;  // true if any entry exceeds threshold
  comparisons: ComparisonEntry[];
}

interface ComparisonEntry {
  operation: string;
  tier: string;
  baselineMedian: number;
  prMedian: number;
  deltaPercent: number;    // (pr - baseline) / baseline * 100
  status: "regression" | "improvement" | "stable" | "new" | "missing";
}
```

## Relationships

```
BenchmarkResult 1──* BenchmarkEntry     (one run produces many entries)
ComparisonReport 1──* ComparisonEntry   (one comparison covers all entries)
ComparisonReport *──1 BenchmarkResult   (baseline)
ComparisonReport *──1 BenchmarkResult   (PR)
```

## Fixture Policies (not runtime entities)

### Small Tier Policy (~5 resources)

- 5 resource types: `Document`, `Comment`, `Tag`, `Category`, `Attachment`
- Roles: `viewer`, `editor`, `admin`
- Grants: Simple direct grants, no conditions
- No derived roles, no relations, no field_access
- Mock resolvers: return empty attributes (no conditions to evaluate)

### Medium Tier Policy (~20 resources)

- 20 resource types across 4 domains (documents, projects, users, billing)
- Roles: `viewer`, `editor`, `admin`, `owner`, `member`
- Derived roles with `when` conditions on `$actor` attributes
- Relations between resources (e.g., Document belongs_to Project)
- Field_access on 3 resource types
- Mock resolvers: return attributes for condition evaluation

### Large Tier Policy (50+ resources)

- 50 resource types across 8 domains
- Roles: 8+ roles per resource including custom roles
- Deep derived role chains (3 levels of derivation)
- Complex conditions with `$actor`, `$resource`, `$env` cross-references
- Forbid rules on 10+ resources
- Field_access on 15+ resource types
- Relations with 2-level traversal
- Mock resolvers: return rich attribute maps for complex condition evaluation

## State Transitions

No state transitions — benchmark results are immutable artifacts. Each CI run produces a new BenchmarkResult; comparison is always fresh.
