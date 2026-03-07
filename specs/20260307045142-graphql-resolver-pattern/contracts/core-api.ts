/**
 * Contract: toride core public API after GraphQL resolver pattern redesign.
 *
 * This file defines the target type signatures for the redesigned API.
 * It serves as the contract between the core engine and all downstream packages.
 */

// ─── ResourceRef (modified) ──────────────────────────────────────

/** A reference to a resource, optionally carrying pre-fetched attributes. */
export interface ResourceRef {
  readonly type: string;
  readonly id: string;
  /** Pre-fetched attributes. Inline values take precedence over resolver results. */
  readonly attributes?: Record<string, unknown>;
}

// ─── Resolver Types (new) ────────────────────────────────────────

/**
 * Per-type resolver function.
 * Called when the engine needs attributes not available inline.
 * Called at most once per unique resource per evaluation (cached).
 */
export type ResourceResolver = (
  ref: ResourceRef,
) => Promise<Record<string, unknown>>;

/**
 * Map of resource type names to their resolver functions.
 * Not all types need resolvers — types without resolvers use trivial resolution
 * (fields are undefined unless provided inline).
 */
export type Resolvers = Record<string, ResourceResolver>;

// ─── Engine Options (modified) ────────────────────────────────────

export interface TorideOptions {
  readonly policy: Policy;
  /** Per-type resolver map. Optional — engine works without resolvers if all data is inline. */
  readonly resolvers?: Resolvers;
  readonly maxConditionDepth?: number;
  readonly maxDerivedRoleDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly onDecision?: (event: DecisionEvent) => void;
  readonly onQuery?: (event: QueryEvent) => void;
}

// ─── Policy Types (modified) ──────────────────────────────────────

/** Simplified relation declaration: just the target resource type name. */
export interface ResourceBlock {
  readonly roles: string[];
  readonly permissions: string[];
  /** Relations map field names to target resource type names (simplified). */
  readonly relations?: Record<string, string>;
  readonly grants?: Record<string, string[]>;
  readonly derived_roles?: DerivedRoleEntry[];
  readonly rules?: Rule[];
  readonly field_access?: Record<string, FieldAccessDef>;
}

// ─── Test Case (modified) ─────────────────────────────────────────

export interface TestCase {
  readonly name: string;
  readonly actor: ActorRef;
  /** Mock resolver data: keyed by "Type:id", values are attribute objects. */
  readonly resolvers?: Record<string, Record<string, unknown>>;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly expected: "allow" | "deny";
}

// ─── Removed Types ────────────────────────────────────────────────

// RelationResolver — REMOVED (replaced by Resolvers map)
// RelationDef — REMOVED (replaced by string in ResourceBlock.relations)

// ─── Unchanged Types (listed for completeness) ────────────────────

// ActorRef — unchanged
// CheckOptions — unchanged
// BatchCheckItem — unchanged (but BatchCheckItem.resource gains optional attributes)
// EvaluatorFn — unchanged
// Policy — unchanged structure (ResourceBlock.relations type changes)
// All condition types — unchanged
// All evaluation result types — unchanged
// All error types — unchanged
// All constraint types — unchanged

// Placeholder types referenced above (actual definitions unchanged)
type Policy = unknown;
type EvaluatorFn = unknown;
type DecisionEvent = unknown;
type QueryEvent = unknown;
type DerivedRoleEntry = unknown;
type Rule = unknown;
type FieldAccessDef = unknown;
type ActorRef = unknown;
