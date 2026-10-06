export const VERSION = "0.0.1";

import { UnsupportedConstraintError } from "toride";
import type {
  ConstraintAdapter,
  ConstraintContext,
  DefaultSchema,
  LeafConstraint,
  ResolverData,
  ResourceRef,
  TorideSchema,
  VirtualFieldsConfig,
} from "toride";

export type PrismaWhere = Record<string, unknown>;
export type PrismaScalarType = "string" | "number" | "boolean";

type ModelScalars<T> = T extends { scalars: infer F } ? F : T;
type AttributeType<T> = unknown extends T ? PrismaScalarType
  : NonNullable<T> extends string ? "string"
  : NonNullable<T> extends number ? "number"
  : NonNullable<T> extends boolean ? "boolean"
  : never;

/** Bindings assert that complete database values match the declared resolver observations. */
export interface PrismaFieldBinding<F extends string = string, T extends PrismaScalarType = PrismaScalarType> {
  readonly field: F;
  readonly type: T;
  readonly nullable: boolean;
  /** Certifies case-sensitive equality with JavaScript strings and no collation normalization. */
  readonly stringComparison?: "binary";
  /** Certifies JavaScript matching for the provider, connection settings, and stored string domain. */
  readonly stringFilters?: "javascript";
}

type FieldBindingFor<Model, T extends PrismaScalarType> = [Model] extends [never]
  ? PrismaFieldBinding<string, T>
  : { [F in keyof ModelScalars<Model> & string]:
      PrismaFieldBinding<F, AttributeType<ModelScalars<Model>[F]> & T> & {
        readonly nullable: null extends ModelScalars<Model>[F] ? true : false;
      }
    }[keyof ModelScalars<Model> & string];

type QueryResource<S extends TorideSchema> = S["resources"] | S["actorTypes"];
type QueryAttributes<S extends TorideSchema, R extends QueryResource<S>> =
  R extends S["resources"] ? S["resourceAttributeMap"][R] : S["actorAttributeMap"][R];
type PolicyFieldNames<S extends TorideSchema, R extends QueryResource<S>> =
  string extends keyof QueryAttributes<S, R> ? string
    : R extends S["resources"]
      ? Exclude<keyof QueryAttributes<S, R> & string, string extends keyof S["relationMap"][R] ? never : keyof S["relationMap"][R]> | "id"
      : keyof QueryAttributes<S, R> & string | "id";

export type PrismaFieldsConfig<S extends TorideSchema, TModelMap = never> = {
  readonly [R in QueryResource<S>]?: {
    readonly [K in PolicyFieldNames<S, R>]?: FieldBindingFor<R extends keyof TModelMap ? TModelMap[R] : never,
      K extends "id" ? "string" : K extends keyof QueryAttributes<S, R>
        ? AttributeType<QueryAttributes<S, R>[K]> : PrismaScalarType>;
  };
};

type RelationBinding<Target extends string, Model> = Model extends { objects: infer O }
  ? { [P in keyof O & string]: {
      readonly field: P;
      readonly resourceType: Target;
      readonly cardinality: NonNullable<O[P]> extends readonly unknown[] ? "many" : "one";
    } }[keyof O & string]
  : { readonly field: string; readonly resourceType: Target; readonly cardinality: "one" | "many" };

export type PrismaRelationsConfig<S extends TorideSchema, TModelMap = never> = {
  readonly [R in S["resources"]]?: {
    readonly [K in keyof S["relationMap"][R] & string]?:
      RelationBinding<S["relationMap"][R][K], [TModelMap] extends [never] ? unknown : R extends keyof TModelMap ? TModelMap[R] : unknown>;
  };
};

export interface PrismaVirtualFieldSemantics {
  readonly cardinality: "many";
  readonly valueType: PrismaScalarType;
  readonly stringComparison?: "binary";
}

export type PrismaVirtualFieldsConfig<S extends TorideSchema, TModelMap = never> = {
  readonly [R in keyof VirtualFieldsConfig<S, TModelMap>]?: {
    readonly [K in keyof NonNullable<VirtualFieldsConfig<S, TModelMap>[R]>]?:
      NonNullable<NonNullable<VirtualFieldsConfig<S, TModelMap>[R]>[K]> & PrismaVirtualFieldSemantics & {
        readonly valueType: R extends S["resources"]
          ? K extends keyof S["resourceAttributeMap"][R]
            ? S["resourceAttributeMap"][R][K] extends readonly (infer V)[] ? AttributeType<V> : PrismaScalarType
            : PrismaScalarType
          : PrismaScalarType;
      };
  };
};

export interface PrismaAdapterOptions<S extends TorideSchema = DefaultSchema, TModelMap = never> {
  readonly fields?: PrismaFieldsConfig<S, TModelMap>;
  readonly relations?: PrismaRelationsConfig<S, TModelMap>;
  readonly virtualFields?: PrismaVirtualFieldsConfig<S, TModelMap>;
}

type RuntimeVirtualField = PrismaVirtualFieldSemantics & {
  readonly relation: string;
  readonly matchField: string;
  readonly filter?: Record<string, unknown>;
};
type RuntimeOptions = {
  fields?: Record<string, Record<string, PrismaFieldBinding | undefined> | undefined>;
  relations?: Record<string, Record<string, RelationBinding<string, unknown> | undefined> | undefined>;
  virtualFields?: Record<string, Record<string, RuntimeVirtualField | undefined> | undefined>;
};

function scalarMatches(value: unknown, type: PrismaScalarType): boolean {
  if (typeof value !== type) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value !== "string"
    || !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}

/**
 * Produces exact Prisma predicates from explicitly bound fields and relations.
 * String filter certification requires case-sensitive matching and well-formed Unicode without NUL.
 * Database values must match the resolver's complete observations. Patterns with SQL wildcard characters
 * or backslashes are rejected. String ordering and native scalar arrays are unsupported.
 */
export function createPrismaAdapter<
  S extends TorideSchema = DefaultSchema,
  TModelMap = never,
  TQueryMap extends Record<string, PrismaWhere> = Record<string, PrismaWhere>,
>(options?: PrismaAdapterOptions<S, TModelMap>): ConstraintAdapter<TQueryMap> {
  const bindings = options as RuntimeOptions | undefined;
  const constants = new WeakMap<PrismaWhere, boolean>();
  const constant = (value: boolean): PrismaWhere => {
    const query = value ? {} : { OR: [] };
    constants.set(query, value);
    return query;
  };
  const always = (): PrismaWhere => constant(true);
  const never = (): PrismaWhere => constant(false);
  const unsupported = (feature: string, context: ConstraintContext): never => {
    throw new UnsupportedConstraintError(feature, context.resourceType);
  };
  const adapter: ConstraintAdapter<Record<string, PrismaWhere>> = {
    translate(node: LeafConstraint, context: ConstraintContext): PrismaWhere {
      if (!context?.resourceType) throw new UnsupportedConstraintError("missing resource context");
      const virtual = bindings?.virtualFields?.[context.resourceType]?.[node.field];
      if (virtual) {
        if (node.type !== "field_includes") return unsupported(`virtual field operator ${node.type}`, context);
        if (virtual.cardinality !== "many" || !scalarMatches(node.value, virtual.valueType)
          || (virtual.valueType === "string" && virtual.stringComparison !== "binary")) {
          return unsupported(`virtual field semantics ${node.field}`, context);
        }
        const match = { [virtual.matchField]: node.value };
        return { [virtual.relation]: { some: virtual.filter ? { AND: [match, virtual.filter] } : match } };
      }
      const binding = bindings?.fields?.[context.resourceType]?.[node.field];
      if (!binding || typeof binding.field !== "string" || typeof binding.nullable !== "boolean"
        || !["string", "number", "boolean"].includes(binding.type)) {
        return unsupported(`unmapped scalar binding ${node.field}`, context);
      }
      const field = binding.field;
      if (node.type === "field_exists") {
        return binding.nullable ? node.exists ? { [field]: { not: null } } : { [field]: null }
          : node.exists ? always() : never();
      }
      if (node.type === "field_includes") return unsupported("native scalar array includes", context);
      const values = node.type === "field_in" || node.type === "field_nin" ? node.values : [node.value];
      if (!values.every(value => scalarMatches(value, binding.type))) {
        return unsupported(`scalar value semantics ${node.field}`, context);
      }
      if (binding.type === "string" && binding.stringComparison !== "binary") {
        return unsupported(`string equality semantics ${node.field}`, context);
      }
      let predicate: PrismaWhere;
      switch (node.type) {
        case "field_eq": predicate = { [field]: node.value }; break;
        case "field_neq": predicate = { [field]: { not: node.value } }; break;
        case "field_in":
          if (node.values.length === 0) return never();
          predicate = { [field]: { in: node.values } };
          break;
        case "field_nin":
          if (node.values.length === 0) return binding.nullable ? { [field]: { not: null } } : always();
          predicate = { [field]: { notIn: node.values } };
          break;
        case "field_gt":
        case "field_gte":
        case "field_lt":
        case "field_lte": {
          if (binding.type !== "number") return unsupported(`non-numeric ordering ${node.field}`, context);
          predicate = { [field]: { [node.type.slice(6)]: node.value } };
          break;
        }
        case "field_contains":
        case "field_starts_with":
        case "field_ends_with": {
          if (binding.type !== "string" || binding.stringFilters !== "javascript"
            || /[%_\\\0]/u.test(node.value)) {
            return unsupported(`string filter semantics ${node.field}`, context);
          }
          const operator = node.type === "field_contains" ? "contains"
            : node.type === "field_starts_with" ? "startsWith" : "endsWith";
          predicate = { [field]: { [operator]: node.value } };
          break;
        }
        default: {
          const exhaustive: never = node;
          return unsupported(`leaf ${(exhaustive as { type: string }).type}`, context);
        }
      }
      return binding.nullable ? { AND: [{ [field]: { not: null } }, predicate] } : predicate;
    },
    relation(field, resourceType, childQuery, context): PrismaWhere {
      const binding = bindings?.relations?.[context.resourceType]?.[field];
      if (!binding || typeof binding.field !== "string") return unsupported(`unmapped relation binding ${field}`, context);
      if (binding.resourceType !== resourceType) return unsupported(`relation target ${field}`, context);
      if (binding.cardinality !== "one" && binding.cardinality !== "many") {
        return unsupported(`relation cardinality ${field}`, context);
      }
      return { [binding.field]: { [binding.cardinality === "many" ? "some" : "is"]: childQuery } };
    },
    and(queries): PrismaWhere {
      if (queries.some(query => constants.get(query) === false)) return never();
      const children = queries.filter(query => constants.get(query) !== true);
      return children.length === 0 ? always() : { AND: children };
    },
    or(queries): PrismaWhere {
      if (queries.some(query => constants.get(query) === true)) return always();
      const children = queries.filter(query => constants.get(query) !== false);
      return children.length === 0 ? never() : { OR: children };
    },
    not(query): PrismaWhere {
      const value = constants.get(query);
      return value === undefined ? { NOT: query } : constant(!value);
    },
    always,
    never,
  };
  return adapter as unknown as ConstraintAdapter<TQueryMap>;
}

export type PrismaResolverSelect<S extends TorideSchema, R extends S["resources"]> =
  Partial<Record<(keyof ResolverData<S, R> & string) | "id", boolean>>;

export interface PrismaResolverOptions<S extends TorideSchema = DefaultSchema, R extends S["resources"] = S["resources"]> {
  readonly select?: PrismaResolverSelect<S, R>;
}

export interface PrismaResolverModel<S extends TorideSchema, R extends S["resources"]> {
  findUnique(query: { where: { id: string }; select?: PrismaResolverSelect<S, R> }): Promise<ResolverData<S, R> | null>;
}

/** The physical model M may differ from policy resource R. Selected-out fields remain partial. */
export function createPrismaResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
  M extends string = R,
>(
  client: { [K in M]: PrismaResolverModel<S, R> },
  modelName: M,
  options?: PrismaResolverOptions<S, R>,
): (ref: ResourceRef<S, R>) => Promise<ResolverData<S, R> | null> {
  return async ref => client[modelName].findUnique({
    where: { id: ref.id },
    ...(options?.select ? { select: options.select } : {}),
  });
}
