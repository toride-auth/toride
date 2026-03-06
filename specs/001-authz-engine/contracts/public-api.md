# Public API Contract: `toride` Package

**Phase 1 Output** | **Date**: 2026-03-06

## Entry Points

### `toride` (main export)

```typescript
export { Toride, createToride } from "./engine";
export { loadYaml, loadJson } from "./policy/parser";
export { mergePolicies } from "./policy/merger";

// Re-export core types
export type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
  CheckOptions,
  BatchCheckItem,
} from "./types";

// Re-export constraint types (public stable API)
export type {
  Constraint,
  LeafConstraint,
  ConstraintResult,
  ConstraintAdapter,
} from "./partial/constraint-types";

// Re-export result types
export type {
  ExplainResult,
  DecisionEvent,
  QueryEvent,
} from "./types";
```

### `toride/client` (subpath export)

```typescript
export { TorideClient } from "./client";
export type { PermissionSnapshot } from "./client";
```

---

## Engine API (`Toride` class)

### Constructor

```typescript
class Toride<TActions extends string = string, TResources extends string = string> {
  constructor(options: TorideOptions): Toride<TActions, TResources>;
}

// Typed factory (convenience)
function createToride<TActions extends string, TResources extends string>(
  options: TorideOptions
): Toride<TActions, TResources>;
```

### Core Check Methods

```typescript
// Boolean permission check
can(
  actor: ActorRef,
  action: TActions,
  resource: ResourceRef,
  options?: CheckOptions
): Promise<boolean>;

// Batch check (shared resolver cache)
canBatch(
  actor: ActorRef,
  checks: BatchCheckItem[],
  options?: CheckOptions
): Promise<boolean[]>;

// List all permitted actions on a resource
permittedActions(
  actor: ActorRef,
  resource: ResourceRef,
  options?: CheckOptions
): Promise<TActions[]>;

// List all resolved roles (direct + derived)
resolvedRoles(
  actor: ActorRef,
  resource: ResourceRef,
  options?: CheckOptions
): Promise<string[]>;
```

### Debug / Explain

```typescript
// Full decision trace (same code path as can())
explain(
  actor: ActorRef,
  action: TActions,
  resource: ResourceRef,
  options?: CheckOptions
): Promise<ExplainResult>;
```

### Partial Evaluation

```typescript
// Build constraint AST for data filtering
buildConstraints(
  actor: ActorRef,
  action: TActions,
  resourceType: TResources,
  options?: CheckOptions
): Promise<ConstraintResult>;

// Translate constraint AST using an adapter
translateConstraints<TQuery>(
  constraints: Constraint,
  adapter: ConstraintAdapter<TQuery>
): TQuery;
```

### Field-Level Access

```typescript
// Check field-level permission
canField(
  actor: ActorRef,
  operation: "read" | "update",
  resource: ResourceRef,
  fieldName: string,
  options?: CheckOptions
): Promise<boolean>;

// List accessible fields
permittedFields(
  actor: ActorRef,
  operation: "read" | "update",
  resource: ResourceRef,
  options?: CheckOptions
): Promise<string[]>;
```

### Client Sync

```typescript
// Build permission snapshot for client-side checks
snapshot(
  actor: ActorRef,
  resources: ResourceRef[],
  options?: CheckOptions
): Promise<PermissionSnapshot>;
```

### Policy Management

```typescript
// Atomic policy swap (in-flight checks unaffected)
setPolicy(policy: Policy): void;
```

---

## Policy Loading API

```typescript
// Parse and validate YAML policy file
function loadYaml(filePath: string): Promise<Policy>;

// Parse and validate JSON policy file
function loadJson(filePath: string): Promise<Policy>;

// Merge two policies (additive union)
// Throws on conflicting grants; rules silently appended
function mergePolicies(base: Policy, overlay: Policy): Policy;
```

### Validation Errors

```typescript
class ValidationError extends Error {
  // Contains logical path to the offending node
  // e.g., "resources.Task.grants references undeclared role \"edtor\""
  readonly path: string;
  readonly message: string;
}
```

---

## RelationResolver Interface

```typescript
interface RelationResolver {
  getRoles(
    actor: ActorRef,
    resource: ResourceRef
  ): Promise<string[]>;

  getRelated(
    resource: ResourceRef,
    relationName: string
  ): Promise<ResourceRef | ResourceRef[]>;

  getAttributes(
    ref: ResourceRef
  ): Promise<Record<string, unknown>>;
}
```

---

## ConstraintAdapter Interface

```typescript
interface ConstraintAdapter<TQuery> {
  translate(constraint: LeafConstraint): TQuery;
  relation(field: string, resourceType: string, childQuery: TQuery): TQuery;
  hasRole(actorId: string, actorType: string, role: string): TQuery;
  unknown(name: string): TQuery;
  and(queries: TQuery[]): TQuery;
  or(queries: TQuery[]): TQuery;
  not(query: TQuery): TQuery;
}
```

---

## TorideClient API (`toride/client`)

```typescript
type PermissionSnapshot = Record<string, string[]>;
// Keys: "Type:id" (e.g., "Task:42")
// Values: permitted action strings

class TorideClient {
  constructor(snapshot: PermissionSnapshot);

  // Synchronous permission check (0ms, no network)
  can(action: string, resource: ResourceRef): boolean;
  // Returns false for unknown resources (default-deny)
}
```

---

## Audit Event Types

```typescript
interface DecisionEvent {
  actor: ActorRef;
  action: string;
  resource: ResourceRef;
  allowed: boolean;
  resolvedRoles: string[];
  matchedRules: { effect: string; matched: boolean }[];
  timestamp: Date;
}

interface QueryEvent {
  actor: ActorRef;
  action: string;
  resourceType: string;
  resultType: "unrestricted" | "forbidden" | "constrained";
  timestamp: Date;
}
```

---

## Error Types

```typescript
// Policy validation failed
class ValidationError extends Error {
  readonly path: string;
}

// Cycle detected in relation traversal
class CycleError extends Error {
  readonly path: string[]; // Resolution path that formed the cycle
}

// Depth limit exceeded
class DepthLimitError extends Error {
  readonly limit: number;
  readonly limitType: "condition" | "derivation";
}
```
