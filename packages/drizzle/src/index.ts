import type { AnyColumn, SQL } from "drizzle-orm";
import { UnsupportedConstraintError } from "toride";
import type {
  ConstraintAdapter,
  ConstraintContext,
  DefaultSchema,
  LeafConstraint,
  ResolverData,
  ResourceRef,
  TorideSchema,
  VirtualFieldMapping,
  VirtualFieldsConfig,
} from "toride";

export const VERSION = "0.0.1";

/**
 * Intermediate query description. Consumers lower every comparison to a total
 * Boolean, with null producing false before applying `_op: "not"`.
 * Binary string operations use JavaScript string semantics and literal values,
 * never SQL LIKE patterns. Consumers reject backend domains they cannot lower.
 * Each relation scope requires its own SQL alias when physical tables repeat.
 */
export type DrizzleQuery = Record<string, unknown>;

export type AnyTable = object;

/** A physical equality join implementing existence of a matching target row. */
export interface RelationConfig {
  readonly resourceType: string;
  readonly cardinality: "one" | "many";
  readonly sourceColumn: string;
  readonly targetColumn: string;
}

export interface DrizzleAdapterOptions<
  S extends TorideSchema = DefaultSchema,
  TModelMap = never,
> {
  /** Policy resource represented by the table passed to createDrizzleAdapter. */
  readonly resourceType: S["resources"];
  /** Related resource and actor tables, used when translation enters a relation. */
  readonly resources?: Partial<Record<S["resources"] | S["actorTypes"], AnyTable>>;
  /** Physical relations indexed by source resource, then policy relation field. */
  readonly relations?: Partial<Record<S["resources"], Record<string, RelationConfig>>>;
  /** Optional policy field to physical column key mappings, indexed by resource. */
  readonly fields?: Partial<Record<S["resources"] | S["actorTypes"], Record<string, string>>>;
  readonly virtualFields?: VirtualFieldsConfig<S, TModelMap>;
}

interface PhysicalColumn {
  readonly name: string;
  readonly dataType: string;
  readonly notNull: boolean;
  readonly table: unknown;
  getSQL(): SQL;
}

function physicalColumn(table: AnyTable, field: string): PhysicalColumn | undefined {
  const column = (table as Record<string, unknown>)[field];
  if (!column || typeof column !== "object") return undefined;
  if (!("name" in column) || typeof column.name !== "string"
    || !("dataType" in column) || typeof column.dataType !== "string"
    || !("notNull" in column) || typeof column.notNull !== "boolean"
    || !("table" in column) || column.table !== table
    || !("getSQL" in column) || typeof column.getSQL !== "function") return undefined;
  return column as PhysicalColumn;
}

/**
 * Creates resource-scoped Drizzle descriptions without constructing SQL.
 * Native column metadata proves scalar type and nullability. Unmapped fields,
 * unbound relations, JSON predicates, and physical array membership are rejected.
 * The application asserts that complete database rows match resolver observations.
 */
export function createDrizzleAdapter<
  S extends TorideSchema = DefaultSchema,
  TModelMap = never,
  TQueryMap extends Record<string, DrizzleQuery> = Record<string, DrizzleQuery>,
>(table: AnyTable, options: DrizzleAdapterOptions<S, TModelMap>): ConstraintAdapter<TQueryMap> {
  if (!options?.resourceType) throw new UnsupportedConstraintError("missing root resource binding");
  const tables = new Map<string, AnyTable>(Object.entries(options.resources ?? {}));
  tables.set(options.resourceType, table);
  const fields: Record<string, Record<string, string> | undefined> = options.fields ?? {};
  const relations: Record<string, Record<string, RelationConfig> | undefined> = options.relations ?? {};
  const virtualFields = options.virtualFields as Record<string, Record<string, VirtualFieldMapping | undefined> | undefined> | undefined;

  function scopedTable(context: ConstraintContext): AnyTable {
    const bound = tables.get(context.resourceType);
    if (!bound) throw new UnsupportedConstraintError("unbound table", context.resourceType);
    return bound;
  }

  function column(field: string, context: ConstraintContext) {
    const bound = scopedTable(context);
    const physicalField = fields[context.resourceType]?.[field] ?? field;
    const metadata = physicalColumn(bound, physicalField);
    if (!metadata) throw new UnsupportedConstraintError(`unbound field ${field}`, context.resourceType);
    return { table: bound, field: physicalField, metadata };
  }

  function emit(description: DrizzleQuery): TQueryMap[string] {
    return description as TQueryMap[string];
  }

  function literal(value: boolean, context: ConstraintContext): TQueryMap[string] {
    return emit({ _op: "literal", value, table: scopedTable(context), resourceType: context.resourceType });
  }

  function relation(field: string, resourceType: string, child: TQueryMap[string], context: ConstraintContext): TQueryMap[string] {
    const binding = relations[context.resourceType]?.[field];
    if (!binding || binding.resourceType !== resourceType
      || (binding.cardinality !== "one" && binding.cardinality !== "many")) {
      throw new UnsupportedConstraintError(`unbound relation ${field}`, context.resourceType);
    }
    const parent = scopedTable(context);
    const target = scopedTable({ resourceType });
    const sourceColumn = physicalColumn(parent, binding.sourceColumn);
    const targetColumn = physicalColumn(target, binding.targetColumn);
    if (!sourceColumn || !targetColumn || sourceColumn.dataType !== targetColumn.dataType
      || !["string", "number", "boolean"].includes(sourceColumn.dataType)) {
      throw new UnsupportedConstraintError(`relation columns ${field}`, context.resourceType);
    }
    return emit({
      _op: "relation", field, table: parent, sourceResourceType: context.resourceType,
      resourceType, relatedTable: target, sourceColumn: binding.sourceColumn,
      targetColumn: binding.targetColumn, cardinality: binding.cardinality,
      quantifier: "any", stringComparison: "binary", child,
    });
  }

  function translate(constraint: LeafConstraint, context: ConstraintContext): TQueryMap[string] {
    const virtualField = virtualFields?.[context.resourceType]?.[constraint.field];
    if (virtualField) {
      if (constraint.type !== "field_includes") {
        throw new UnsupportedConstraintError(`virtual field ${constraint.type}`, context.resourceType);
      }
      const binding = relations[context.resourceType]?.[virtualField.relation];
      if (!binding) throw new UnsupportedConstraintError(`unbound virtual relation ${virtualField.relation}`, context.resourceType);
      const target = { resourceType: binding.resourceType };
      const children = [translate({ type: "field_eq", field: virtualField.matchField, value: constraint.value }, target)];
      for (const [field, value] of Object.entries(virtualField.filter ?? {})) {
        children.push(translate({ type: "field_eq", field, value }, target));
      }
      const child = children.length === 1 ? children[0] : emit({ _op: "and", children, table: scopedTable(target), resourceType: target.resourceType });
      return relation(virtualField.relation, binding.resourceType, child, context);
    }

    const bound = column(constraint.field, context);
    const base = { field: bound.field, table: bound.table, resourceType: context.resourceType, nullable: !bound.metadata.notNull };
    const dataType = bound.metadata.dataType;
    if (!["string", "number", "boolean"].includes(dataType)) {
      throw new UnsupportedConstraintError(`scalar type ${dataType}`, context.resourceType);
    }
    if (constraint.type === "field_exists") {
      return emit({ _op: constraint.exists ? "isNotNull" : "isNull", ...base, nullBehavior: "total" });
    }
    if (constraint.type === "field_includes") {
      throw new UnsupportedConstraintError("physical array membership", context.resourceType);
    }
    const values = constraint.type === "field_in" || constraint.type === "field_nin" ? constraint.values : [constraint.value];
    if (values.some(value => value === undefined || (value !== null && (typeof value !== dataType
      || (typeof value === "number" && !Number.isFinite(value)))))) {
      throw new UnsupportedConstraintError(`comparison value ${constraint.type}`, context.resourceType);
    }
    const comparison = { ...base, nullBehavior: "false", ...(dataType === "string" ? { stringComparison: "binary" } : {}) };
    switch (constraint.type) {
      case "field_eq": return constraint.value === null ? literal(false, context) : emit({ _op: "eq", ...comparison, value: constraint.value });
      case "field_neq": return constraint.value === null ? literal(false, context) : emit({ _op: "ne", ...comparison, value: constraint.value });
      case "field_gt":
      case "field_gte":
      case "field_lt":
      case "field_lte":
        if (dataType !== "number") throw new UnsupportedConstraintError("ordered nonnumeric comparison", context.resourceType);
        return constraint.value === null ? literal(false, context) : emit({ _op: constraint.type.slice(6), ...comparison, value: constraint.value });
      case "field_in": return emit({ _op: "inArray", ...comparison, values: constraint.values.filter(value => value !== null) });
      case "field_nin": return emit({ _op: "notInArray", ...comparison, values: constraint.values.filter(value => value !== null) });
      case "field_contains":
      case "field_starts_with":
      case "field_ends_with":
        if (dataType !== "string") {
          throw new UnsupportedConstraintError("exact binary string matching", context.resourceType);
        }
        return emit({
          _op: constraint.type === "field_contains" ? "contains" : constraint.type === "field_starts_with" ? "startsWith" : "endsWith",
          ...comparison, value: constraint.value,
        });
      default: {
        const exhaustive: never = constraint;
        throw new UnsupportedConstraintError(String(exhaustive), context.resourceType);
      }
    }
  }

  return {
    translate,
    relation,
    always: context => literal(true, context),
    never: context => literal(false, context),
    and: (children, context) => emit({ _op: "and", children, table: scopedTable(context), resourceType: context.resourceType }),
    or: (children, context) => emit({ _op: "or", children, table: scopedTable(context), resourceType: context.resourceType }),
    not: (child, context) => emit({ _op: "not", child, table: scopedTable(context), resourceType: context.resourceType }),
  };
}

export interface DrizzleResolverOptions {
  /** Physical column key used as the resource ID. Defaults to "id". */
  readonly idColumn?: string;
}

/** Native selected column types must agree with the policy fields they expose. */
export type DrizzleResolverTable<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> = AnyTable & { readonly $inferSelect: ResolverData<S, R> & Record<string, unknown> };

interface ResolverDatabase {
  select(): { from(table: AnyTable): { where(condition: SQL): PromiseLike<unknown[]> } };
}

/**
 * Resolves a row using native Drizzle column equality. The optional drizzle-orm
 * peer is loaded when the resolver runs. Missing rows return null. Returned data
 * is partial because selected physical columns need not cover policy attributes.
 */
export function createDrizzleResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(db: ResolverDatabase, table: DrizzleResolverTable<S, R>, options?: DrizzleResolverOptions): (ref: ResourceRef<S, R>) => Promise<ResolverData<S, R> | null> {
  const idField = options?.idColumn ?? "id";
  const idColumn = physicalColumn(table, idField);
  if (!idColumn) throw new Error(`Drizzle resolver ID column "${idField}" is not bound`);

  return async ref => {
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(table).where(eq(idColumn as AnyColumn, ref.id));
    return rows.length === 0 ? null : rows[0] as ResolverData<S, R>;
  };
}
