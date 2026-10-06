import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { sqliteTable, text, integer, alias } from 'drizzle-orm/sqlite-core';
import { and, or, not, eq, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, sql, asc, count, exists, getTableName } from 'drizzle-orm';

export { asc, count, getTableName };
export const tables = {
  Document: sqliteTable('Document', { id: text('id').primaryKey(), tenant: text('tenant').notNull(), blocked: integer('blocked', { mode: 'boolean' }).notNull(), title: text('title'), rank: integer('rank'), ownerId: text('ownerId'), projectId: text('projectId') }),
  Project: sqliteTable('Project', { id: text('id').primaryKey(), isPublic: integer('isPublic', { mode: 'boolean' }).notNull() }),
  User: sqliteTable('User', { id: text('id').primaryKey() }),
  Reviewer: sqliteTable('Reviewer', { documentId: text('documentId').notNull(), userId: text('userId').notNull(), approved: integer('approved', { mode: 'boolean' }).notNull() }),
};
export function lower(node, db, scope = new Map(), counter = { value: 0 }) {
  assert(node && typeof node._op === 'string', 'Expected a public Drizzle operation description');
  if (node._op === 'literal') return sql`${node.value ? 1 : 0}`;
  if (node._op === 'and') return node.children.length ? and(...node.children.map((child) => lower(child, db, scope, counter))) : sql`1`;
  if (node._op === 'or') return node.children.length ? or(...node.children.map((child) => lower(child, db, scope, counter))) : sql`0`;
  if (node._op === 'not') return not(lower(node.child, db, scope, counter));
  if (node._op === 'relation') {
    assert(node.table && node.relatedTable && node.sourceColumn && node.targetColumn, 'Relation requires an explicit physical binding');
    assert.equal(node.quantifier, 'any');
    const relatedTable = alias(node.relatedTable, `verify_relation_${counter.value++}`);
    const source = (scope.get(node.table) ?? node.table)[node.sourceColumn];
    const target = relatedTable[node.targetColumn];
    const joinCondition = source.dataType === 'string' ? sql`${source} collate binary = ${target} collate binary` : eq(source, target);
    const childScope = new Map(scope).set(node.relatedTable, relatedTable);
    return exists(db.select({ one: sql`1` }).from(relatedTable).where(and(joinCondition, lower(node.child, db, childScope, counter))));
  }
  const column = (scope.get(node.table) ?? node.table)?.[node.field];
  assert(column, `No physical column for ${node.field}`);
  const valueColumn = node.stringComparison === 'binary' ? sql`${column} collate binary` : column;
  if (node._op === 'isNull') return isNull(column);
  if (node._op === 'isNotNull') return isNotNull(column);
  const comparisons = { eq, ne, gt, gte, lt, lte };
  let predicate;
  if (comparisons[node._op]) predicate = comparisons[node._op](valueColumn, node.value);
  else if (node._op === 'inArray') predicate = node.values.length ? inArray(valueColumn, node.values) : sql`0`;
  else if (node._op === 'notInArray') predicate = node.values.length ? notInArray(valueColumn, node.values) : sql`1`;
  else if (node._op === 'contains') predicate = sql`instr(${column}, ${node.value}) > 0`;
  else if (node._op === 'startsWith') predicate = sql`substr(${column}, 1, length(${node.value})) = ${node.value} collate binary`;
  else if (node._op === 'endsWith') predicate = node.value === '' ? sql`1` : sql`substr(${column}, -length(${node.value})) = ${node.value} collate binary`;
  else throw new Error(`Unsupported consumer operation ${node._op}`);
  assert.equal(node.nullBehavior, 'false', 'Ordinary comparisons must declare total false semantics at null');
  return and(isNotNull(column), predicate);
}
export function withMinimumRank(predicate, value) {
  return and(predicate, gte(tables.Document.rank, value));
}
export function createDatabase(scratch, feature, events) {
  function executePython(statement, params = []) {
    const result = spawnSync('python3', [join(scratch, 'sqlite.py'), join(scratch, `${feature}-drizzle.db`)], { input: JSON.stringify({ sql: statement, params }), encoding: 'utf8' });
    events.push({ query: statement, params, exitCode: result.status, stderr: result.stderr });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return drizzle(async (statement, params, method) => {
    const result = executePython(statement, params);
    return { rows: method === 'get' ? result.rows[0] : result.rows };
  });
}
