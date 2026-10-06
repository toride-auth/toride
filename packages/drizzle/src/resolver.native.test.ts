import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createDrizzleResolver } from "./index.js";

const directory = mkdtempSync(join(tmpdir(), "toride-drizzle-resolver-"));
const database = join(directory, "fixture.sqlite");
const python = `import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
request = json.load(sys.stdin)
cursor = connection.execute(request["sql"], request["params"])
rows = cursor.fetchall() if cursor.description else []
connection.commit()
print(json.dumps(rows))
`;

function execute(sql: string, params: unknown[] = []): unknown[][] {
  const process = spawnSync("python3", ["-c", python, database], {
    input: JSON.stringify({ sql, params }),
    encoding: "utf8",
  });
  if (process.status !== 0) throw new Error(process.stderr);
  return JSON.parse(process.stdout);
}

execute('create table "Document" ("uuid" text primary key, "title" text)');
execute('insert into "Document" values (?, ?), (?, ?)', ["d1", "first", "d2", "second"]);
const documents = sqliteTable("Document", {
  uuid: text("uuid").primaryKey(),
  title: text("title"),
});
const statements: { sql: string; params: unknown[] }[] = [];
const db = drizzle(async (sql, params) => {
  statements.push({ sql, params });
  return { rows: execute(sql, params) };
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("native Drizzle resolver", () => {
  it("uses native column equality and selects the requested second row", async () => {
    const resolver = createDrizzleResolver(db, documents, { idColumn: "uuid" });
    await expect(resolver({ type: "Document", id: "d2" })).resolves.toEqual({ uuid: "d2", title: "second" });
    expect(statements.at(-1)).toEqual({
      sql: 'select "uuid", "title" from "Document" where "Document"."uuid" = ?',
      params: ["d2"],
    });
  });

  it("returns null for an absent row", async () => {
    const resolver = createDrizzleResolver(db, documents, { idColumn: "uuid" });
    await expect(resolver({ type: "Document", id: "missing" })).resolves.toBeNull();
  });

  it("rejects an unbound ID column before executing a query", async () => {
    const before = statements.length;
    expect(() => createDrizzleResolver(db, documents, { idColumn: "missing" })).toThrow(/ID column/);
    expect(statements).toHaveLength(before);
  });
});
