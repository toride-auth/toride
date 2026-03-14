/**
 * Contract: New ConstraintResult type
 *
 * Replaces the old three-way union:
 *   | { readonly unrestricted: true; readonly __resource?: R }
 *   | { readonly forbidden: true; readonly __resource?: R }
 *   | { readonly constraints: Constraint; readonly __resource?: R }
 *
 * With a clean ok-based result:
 */

import type { Constraint } from "../../packages/toride/src/partial/constraint-types.js";

/** Result of partial evaluation. */
export type ConstraintResult<R extends string = string> =
  | { readonly ok: true; readonly constraint: Constraint | null; readonly __resource?: R }
  | { readonly ok: false; readonly __resource?: R };
