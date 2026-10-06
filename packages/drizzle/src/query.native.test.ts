import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createDrizzleAdapter } from "./index.js";
import type { DrizzleQuery } from "./index.js";

const directory = mkdtempSync(join(tmpdir(), "toride-drizzle-query-"));
const database = join(directory, "fixture.sqlite");
const python = `import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
request = json.load(sys.stdin)
cursor = connection.execute(request["sql"], request["params"])
rows = cursor.fetchall() if cursor.description else []
connection.commit()
print(json.dumps(rows))
`;
function execute(query: string, params: unknown[] = []): unknown[][] {
  const process = spawnSync("python3", ["-c", python, database], { input: JSON.stringify({ sql: query, params }), encoding: "utf8" });
  if (process.status !== 0) throw new Error(process.stderr);
  return JSON.parse(process.stdout);
}
execute('create table "Document" ("id" text primary key, "title" text collate nocase, "rank" integer, "projectId" text)');
execute('create table "Project" ("id" text primary key, "status" text)');
execute('insert into "Document" values (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)', [
  "d1", null, null, null, "d2", "A%_\\x", 1, "p1", "d3", "a%_\\x", 2, "p2", "d4", "xA%_\\", 3, "missing", "d5", "", 4, "p1",
]);
execute('insert into "Project" values (?, ?), (?, ?)', ["p1", "public", "p2", null]);
const documents = sqliteTable("Document", { id: text("id").primaryKey(), title: text("title"), rank: integer("rank"), projectId: text("projectId") });
const projects = sqliteTable("Project", { id: text("id").primaryKey(), status: text("status") });
const db = drizzle(async (query, params) => ({ rows: execute(query, params) }));
const root = { resourceType: "Document" };
const related = { resourceType: "Project" };
const adapter = createDrizzleAdapter(documents, {
  resourceType: "Document", resources: { Project: projects },
  relations: { Document: { project: { resourceType: "Project", cardinality: "one", sourceColumn: "projectId", targetColumn: "id" } } },
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function lower(query: DrizzleQuery): SQL {
  const table = query.table as Record<string, SQLWrapper>;
  const column = table[query.field as string];
  const value = query.value;
  const total = (predicate: SQL) => sql`coalesce((${predicate}), false)`;
  const binaryColumn = query.stringComparison === "binary" ? sql`${column} collate binary` : sql`${column}`;
  switch (query._op) {
    case "literal": return query.value ? sql`true` : sql`false`;
    case "isNull": return sql`${column} is null`;
    case "isNotNull": return sql`${column} is not null`;
    case "eq": return total(sql`${binaryColumn} = ${value}`);
    case "ne": return total(sql`${binaryColumn} <> ${value}`);
    case "gt": return total(sql`${column} > ${value}`);
    case "gte": return total(sql`${column} >= ${value}`);
    case "lt": return total(sql`${column} < ${value}`);
    case "lte": return total(sql`${column} <= ${value}`);
    case "inArray":
    case "notInArray": {
      const values = query.values as unknown[];
      if (!values.length) return query._op === "inArray" ? sql`false` : sql`${column} is not null`;
      const operator = query._op === "inArray" ? sql`in` : sql`not in`;
      return total(sql`${binaryColumn} ${operator} (${sql.join(values.map(item => sql`${item}`), sql`, `)})`);
    }
    case "contains": return total(sql`instr(${column}, ${value}) > 0`);
    case "startsWith": return total(sql`substr(${column}, 1, length(${value})) collate binary = ${value}`);
    case "endsWith": return value === "" ? sql`${column} is not null` : total(sql`substr(${column}, -length(${value})) collate binary = ${value}`);
    case "not": return sql`not (${lower(query.child as DrizzleQuery)})`;
    case "and":
    case "or": {
      const children = query.children as DrizzleQuery[];
      if (!children.length) return query._op === "and" ? sql`true` : sql`false`;
      return sql`(${sql.join(children.map(lower), query._op === "and" ? sql` and ` : sql` or `)})`;
    }
    case "relation": {
      const target = query.relatedTable as Record<string, SQLWrapper>;
      const sourceColumn = table[query.sourceColumn as string];
      const targetColumn = target[query.targetColumn as string];
      return sql`exists (select 1 from ${query.relatedTable as SQLWrapper} where ${targetColumn} collate binary = ${sourceColumn} collate binary and ${lower(query.child as DrizzleQuery)})`;
    }
    default: throw new Error(`Unsupported native description ${String(query._op)}`);
  }
}

async function ids(query: DrizzleQuery, limit?: number, offset = 0): Promise<string[]> {
  const select = db.select({ id: documents.id }).from(documents).where(lower(query)).orderBy(documents.id).$dynamic();
  const rows = await (limit === undefined ? select : select.limit(limit).offset(offset));
  return rows.map(row => row.id);
}

async function count(query: DrizzleQuery): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(documents).where(lower(query));
  return rows[0].count;
}

describe("native SQLite description consumption", () => {
  it("matches exact binary equality despite NOCASE physical collation", async () => {
    const query = adapter.translate({ type: "field_eq", field: "title", value: "A%_\\x" }, root);
    expect(await ids(query)).toEqual(["d2"]);
    expect(await ids(adapter.not(query, root))).toEqual(["d1", "d3", "d4", "d5"]);
  });

  it("excludes null from positive inequality and includes it in the complement", async () => {
    const query = adapter.translate({ type: "field_neq", field: "rank", value: 1 }, root);
    expect(await ids(query)).toEqual(["d3", "d4", "d5"]);
    expect(await ids(adapter.not(query, root))).toEqual(["d1", "d2"]);
    expect(await count(query)).toBe(3);
    expect(await ids(query, 1, 1)).toEqual(["d4"]);
  });

  it.each([
    ["field_contains", ["d2", "d4"]], ["field_starts_with", ["d2"]], ["field_ends_with", ["d4"]],
  ] as const)("matches literal wildcard and case semantics for %s", async (type, expected) => {
    const query = adapter.translate({ type, field: "title", value: "A%_\\" }, root);
    expect(await ids(query)).toEqual(expected);
  });

  it.each(["field_contains", "field_starts_with", "field_ends_with"] as const)("matches empty %s for every present string", async type => {
    const query = adapter.translate({ type, field: "title", value: "" }, root);
    expect(await ids(query)).toEqual(["d2", "d3", "d4", "d5"]);
    expect(await ids(adapter.not(query, root))).toEqual(["d1"]);
  });

  it("requires relation existence with a true child and complements absent relations", async () => {
    const query = adapter.relation("project", "Project", adapter.always(related), root);
    expect(await ids(query)).toEqual(["d2", "d3", "d5"]);
    expect(await ids(adapter.not(query, root))).toEqual(["d1", "d4"]);
    const publicProject = adapter.relation("project", "Project", adapter.translate({ type: "field_eq", field: "status", value: "public" }, related), root);
    expect(await ids(publicProject)).toEqual(["d2", "d5"]);
  });

  it("preserves membership null and empty set semantics", async () => {
    const query = adapter.translate({ type: "field_nin", field: "rank", values: [1, null] }, root);
    expect(await ids(query)).toEqual(["d3", "d4", "d5"]);
    expect(await ids(adapter.not(query, root))).toEqual(["d1", "d2"]);
    expect(await ids(adapter.translate({ type: "field_in", field: "rank", values: [] }, root))).toEqual([]);
    expect(await ids(adapter.translate({ type: "field_nin", field: "rank", values: [] }, root))).toEqual(["d2", "d3", "d4", "d5"]);
  });
});
