// toride - Relation-aware authorization engine for TypeScript
export const VERSION = "0.0.1";

// ─── Policy Loading (T020) ────────────────────────────────────────
export { loadYaml, loadJson } from "./policy/parser.js";

// ─── Policy Merging (T096) ──────────────────────────────────────
export { mergePolicies } from "./policy/merger.js";

// ─── Policy Validation (T075-T077) ──────────────────────────────
export {
  validatePolicy,
  validatePolicyResult,
  validatePolicyStrict,
} from "./policy/validator.js";
export type {
  ValidationDiagnostic,
  ValidationResult,
  StrictValidationResult,
} from "./policy/validator.js";

// ─── Core Runtime Types (T015) ────────────────────────────────────
export type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
  CheckOptions,
  BatchCheckItem,
  EvaluatorFn,
  AttributeType,
  ActorDeclaration,
  GlobalRole,
  RelationDef,
  DerivedRoleEntry,
  Rule,
  FieldAccessDef,
  ResourceBlock,
  ConditionExpression,
  ConditionValue,
  ConditionOperator,
  SimpleConditions,
  TestCase,
} from "./types.js";

// ─── Evaluation Result Types (T017) ──────────────────────────────
export type {
  ExplainResult,
  ResolvedRolesDetail,
  DerivedRoleTrace,
  MatchedRule,
  DecisionEvent,
  QueryEvent,
} from "./types.js";

// ─── Error Types (T018) ──────────────────────────────────────────
export { ValidationError, CycleError, DepthLimitError } from "./types.js";

// ─── Engine (T030/T031) ──────────────────────────────────────────
export { Toride, createToride } from "./engine.js";

// ─── Snapshot (T081/T084) ────────────────────────────────────────
export type { PermissionSnapshot } from "./snapshot.js";

// ─── Constraint AST Types (T016) ─────────────────────────────────
export type {
  Constraint,
  LeafConstraint,
  ConstraintResult,
  ConstraintAdapter,
} from "./partial/constraint-types.js";

// ─── Testing Utilities (T087-T089) ──────────────────────────────
export { createMockResolver } from "./testing/mock-resolver.js";
export { parseInlineTests, parseTestFile } from "./testing/test-parser.js";
export { runTestCases } from "./testing/test-runner.js";
export type { TestResult } from "./testing/test-runner.js";
export type { TestFileResult } from "./testing/test-parser.js";
