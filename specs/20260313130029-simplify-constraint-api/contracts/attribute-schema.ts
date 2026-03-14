/**
 * Contract: AttributeSchema recursive type
 *
 * Replaces the flat `AttributeType = "string" | "number" | "boolean"`.
 * Used in both ResourceBlock.attributes and ActorDeclaration.attributes.
 */

/** Primitive attribute type (backward compatible with existing flat declarations). */
export interface PrimitiveAttributeSchema {
  readonly kind: "primitive";
  readonly type: "string" | "number" | "boolean";
}

/** Nested object attribute type. */
export interface ObjectAttributeSchema {
  readonly kind: "object";
  readonly fields: Record<string, AttributeSchema>;
}

/** Array attribute type. */
export interface ArrayAttributeSchema {
  readonly kind: "array";
  readonly items: AttributeSchema;
}

/** Recursive discriminated union for attribute type declarations. */
export type AttributeSchema =
  | PrimitiveAttributeSchema
  | ObjectAttributeSchema
  | ArrayAttributeSchema;

// ─── Updated ResourceBlock.attributes ────────────────────────────

/**
 * ResourceBlock.attributes changes from:
 *   attributes?: Record<string, AttributeType>
 * To:
 *   attributes?: Record<string, AttributeSchema>
 *
 * Similarly for ActorDeclaration.attributes.
 */

// ─── Updated ResourceResolver return type ────────────────────────

/**
 * ResourceResolver<S, R> return type changes from:
 *   Promise<Record<string, unknown>>
 * To:
 *   Promise<Partial<S['resourceAttributeMap'][R]>>
 */
