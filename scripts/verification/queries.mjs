#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Toride, loadJson } from 'toride';
import { createPrismaAdapter, createPrismaResolver } from '@toride/prisma';
import { createDrizzleAdapter, createDrizzleResolver } from '@toride/drizzle';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { and, or, not, eq, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, sql, asc, count, exists, getTableName } from 'drizzle-orm';
import { recorder, evidence, scratch } from './support.mjs';
import { actor, rows, projects, users, reviewers, queryCases, policy, runtimeResolvers } from './fixtures.mjs';

const feature = process.argv[2];
const proof = recorder(feature);
const root = process.env.TORIDE_VERIFY_ROOT;
const sqlEvents = { prisma: [], drizzle: [] };
const translations = [];
const ids = (result) => result.map((row) => row.id);
const tables = {
  Document: sqliteTable('Document', { id: text('id').primaryKey(), tenant: text('tenant').notNull(), blocked: integer('blocked', { mode: 'boolean' }).notNull(), title: text('title'), rank: integer('rank'), ownerId: text('ownerId'), projectId: text('projectId') }),
  Project: sqliteTable('Project', { id: text('id').primaryKey(), isPublic: integer('isPublic', { mode: 'boolean' }).notNull() }),
  User: sqliteTable('User', { id: text('id').primaryKey() }),
  Reviewer: sqliteTable('Reviewer', { documentId: text('documentId').notNull(), userId: text('userId').notNull(), approved: integer('approved', { mode: 'boolean' }).notNull() }),
};
const fields = {
  Document: Object.fromEntries(Object.entries({ id: ['string', false], tenant: ['string', false], blocked: ['boolean', false], title: ['string', true], rank: ['number', true], ownerId: ['string', true], projectId: ['string', true] }).map(([field, [type, nullable]]) => [field, { field, type, nullable, ...(type === 'string' ? { stringComparison: 'binary' } : {}) }])),
  Project: { id: { field: 'id', type: 'string', nullable: false, stringComparison: 'binary' }, isPublic: { field: 'isPublic', type: 'boolean', nullable: false } },
  User: { id: { field: 'id', type: 'string', nullable: false, stringComparison: 'binary' } },
  Reviewer: { userId: { field: 'userId', type: 'string', nullable: false, stringComparison: 'binary' }, approved: { field: 'approved', type: 'boolean', nullable: false } },
};
function prismaAdapter() {
  return createPrismaAdapter({ fields: { ...fields, Document: { ...fields.Document, title: { ...fields.Document.title, stringFilters: 'javascript' } } }, relations: { Document: { project: { field: 'project', resourceType: 'Project', cardinality: 'one' }, owner: { field: 'owner', resourceType: 'User', cardinality: 'one' }, reviewers: { field: 'reviewers', resourceType: 'Reviewer', cardinality: 'many' } } } });
}
function drizzleAdapter() {
  return createDrizzleAdapter(tables.Document, { resourceType: 'Document', resources: tables, relations: { Document: { project: { resourceType: 'Project', cardinality: 'one', sourceColumn: 'projectId', targetColumn: 'id' }, owner: { resourceType: 'User', cardinality: 'one', sourceColumn: 'ownerId', targetColumn: 'id' }, reviewers: { resourceType: 'Reviewer', cardinality: 'many', sourceColumn: 'id', targetColumn: 'documentId' } } } });
}
function lower(node, db) {
  assert(node && typeof node._op === 'string', 'Expected a public Drizzle operation description');
  if (node._op === 'literal') return sql`${node.value ? 1 : 0}`;
  if (node._op === 'and') return node.children.length ? and(...node.children.map((child) => lower(child, db))) : sql`1`;
  if (node._op === 'or') return node.children.length ? or(...node.children.map((child) => lower(child, db))) : sql`0`;
  if (node._op === 'not') return not(lower(node.child, db));
  if (node._op === 'relation') {
    assert(node.table && node.relatedTable && node.sourceColumn && node.targetColumn, 'Relation requires an explicit physical binding');
    assert.equal(node.quantifier, 'any');
    const source = node.table[node.sourceColumn];
    const target = node.relatedTable[node.targetColumn];
    const joinCondition = source.dataType === 'string' ? sql`${source} collate binary = ${target} collate binary` : eq(source, target);
    return exists(db.select({ one: sql`1` }).from(node.relatedTable).where(and(joinCondition, lower(node.child, db))));
  }
  const column = node.table?.[node.field];
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
function sanitize(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) => ['table', 'relatedTable'].includes(key) && entry ? getTableName(entry) : entry));
}
function executePython(statement, params = []) {
  const result = spawnSync('python3', [join(scratch, 'sqlite.py'), join(scratch, `${feature}-drizzle.db`)], { input: JSON.stringify({ sql: statement, params }), encoding: 'utf8' });
  sqlEvents.drizzle.push({ query: statement, params, exitCode: result.status, stderr: result.stderr });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const db = drizzle(async (statement, params, method) => {
  const result = executePython(statement, params);
  return { rows: method === 'get' ? result.rows[0] : result.rows };
});
const ddls = [
  'CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "isPublic" BOOLEAN NOT NULL)',
  'CREATE TABLE "User" ("id" TEXT PRIMARY KEY)',
  'CREATE TABLE "Document" ("id" TEXT PRIMARY KEY, "tenant" TEXT NOT NULL, "blocked" BOOLEAN NOT NULL, "title" TEXT, "rank" INTEGER, "ownerId" TEXT, "projectId" TEXT)',
  'CREATE TABLE "Reviewer" ("documentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "approved" BOOLEAN NOT NULL, PRIMARY KEY ("documentId", "userId"))',
];
let prisma;
try {
  const generation = spawnSync(process.execPath, [join(scratch, 'node_modules/prisma/build/index.js'), 'generate'], { cwd: scratch, encoding: 'utf8', env: process.env });
  writeFileSync(join(evidence, `${feature}-prisma-generate.log`), generation.stdout + generation.stderr);
  writeFileSync(join(evidence, `${feature}-prisma-generate.command.json`), JSON.stringify({ executable: process.execPath, args: [join(scratch, 'node_modules/prisma/build/index.js'), 'generate'], cwd: scratch, exitCode: generation.status }, null, 2));
  assert.equal(generation.status, 0, 'Scratch Prisma Client generation failed');
  const { PrismaClient } = await import('./generated/index.js');
  prisma = new PrismaClient({ adapter: new PrismaLibSQL({ url: `file:${scratch}/${feature}-prisma.db` }), log: [{ emit: 'event', level: 'query' }] });
  prisma.$on('query', ({ query, params }) => sqlEvents.prisma.push({ query, params }));
  await prisma.$executeRawUnsafe('PRAGMA case_sensitive_like = ON');
  for (const ddl of ddls) {
    await prisma.$executeRawUnsafe(ddl);
    executePython(ddl);
  }
  for (const [table, data] of [['Project', projects], ['User', users], ['Document', rows], ['Reviewer', reviewers]]) {
    await prisma[table[0].toLowerCase() + table.slice(1)].createMany({ data });
    await db.insert(tables[table]).values(data);
  }
  await proof.check('prisma-local-fixture-roundtrip', { rows }, rows, () => prisma.document.findMany({ orderBy: { id: 'asc' } }));
  await proof.check('drizzle-local-fixture-roundtrip', { rows }, rows, () => db.select().from(tables.Document).orderBy(asc(tables.Document.id)));
  if (feature === 'orm-resolvers') {
    await proof.check('prisma-resolver-id-and-missing', { ids: ['d02', 'd08', 'missing'] }, ['d02', 'd08', null], async () => {
      const resolve = createPrismaResolver(prisma, 'document');
      return Promise.all(['d02', 'd08', 'missing'].map(async (id) => (await resolve({ type: 'Document', id }))?.id ?? null));
    });
    await proof.check('prisma-resolver-selection-is-partial', { id: 'd02', select: { tenant: true } }, { tenant: 'alpha' }, async () => createPrismaResolver(prisma, 'document', { select: { tenant: true } })({ type: 'Document', id: 'd02' }));
    await proof.check('prisma-resolver-missing-is-null', { id: 'missing' }, null, async () => createPrismaResolver(prisma, 'document')({ type: 'Document', id: 'missing' }));
    await proof.check('drizzle-resolver-id-and-missing', { ids: ['d02', 'd08', 'missing'] }, ['d02', 'd08', null], async () => {
      const resolve = createDrizzleResolver(db, tables.Document);
      return Promise.all(['d02', 'd08', 'missing'].map(async (id) => (await resolve({ type: 'Document', id }))?.id ?? null));
    });
    await proof.check('drizzle-resolver-missing-is-null', { id: 'missing' }, null, async () => createDrizzleResolver(db, tables.Document)({ type: 'Document', id: 'missing' }));
  } else {
    for (const test of queryCases) {
      const expectedIds = test.expected?.ids ?? test.ids;
      const expected = test.expected ?? { ids: expectedIds, count: expectedIds.length, first: expectedIds.slice(0, 2), second: expectedIds.slice(2, 4), last: expectedIds.slice(3, 5) };
      const input = policy(test.definition);
      const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: runtimeResolvers });
      await proof.check(`${test.id}-runtime`, { policy: input, actor, rows }, expectedIds, async () => {
        const decisions = await Promise.all(rows.map((row) => instance.can(actor, 'read', { type: 'Document', id: row.id })));
        return rows.filter((_, index) => decisions[index]).map((row) => row.id);
      });
      for (const backend of ['prisma', 'drizzle']) {
        if (backend === 'prisma' && test.prismaUnsupported) {
          await proof.check(`${test.id}-prisma-reject-before-query`, { policy: input, actor }, { error: 'UnsupportedConstraintError', queryCountChange: 0 }, async () => {
            const before = sqlEvents.prisma.length;
            let error;
            try {
              const result = await instance.buildConstraints(actor, 'read', 'Document');
              assert(result.ok && result.constraint, 'Literal string fixture must require a predicate');
              instance.translateConstraints(result.constraint, prismaAdapter());
            } catch (caught) { error = caught.name; }
            return { error, queryCountChange: sqlEvents.prisma.length - before };
          });
          continue;
        }
        await proof.check(`${test.id}-${backend}-membership-count-pages`, { policy: input, actor, expected }, expected, async () => {
          const result = await instance.buildConstraints(actor, 'read', 'Document');
          if (!result.ok) return { ids: [], count: 0, first: [], second: [], last: [] };
          const translated = result.constraint === null ? null : instance.translateConstraints(result.constraint, backend === 'prisma' ? prismaAdapter() : drizzleAdapter());
          translations.push({ case: test.id, backend, result, translated: backend === 'prisma' ? translated : sanitize(translated) });
          if (backend === 'prisma') {
            const where = translated ?? {};
            return { ids: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' } })), count: await prisma.document.count({ where }), first: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 0, take: 2 })), second: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 2, take: 2 })), last: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 3, take: 2 })) };
          }
          const where = translated === null ? undefined : lower(translated, db);
          const select = () => db.select().from(tables.Document).where(where).orderBy(asc(tables.Document.id));
          return { ids: ids(await select()), count: (await db.select({ count: count() }).from(tables.Document).where(where))[0].count, first: ids(await select().limit(2).offset(0)), second: ids(await select().limit(2).offset(2)), last: ids(await select().limit(2).offset(3)) };
        });
      }
    }
    for (const backend of ['prisma', 'drizzle']) {
      const instance = new Toride({ policy: await loadJson(JSON.stringify(policy({ rules: [] }))) });
      for (const test of [
        { id: 'not-always', node: { type: 'not', child: { type: 'always' } }, ids: [] },
        { id: 'or-always-never', node: { type: 'or', children: [{ type: 'always' }, { type: 'never' }] }, ids: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
        { id: 'relation-always-requires-existence', node: { type: 'relation', field: 'project', resourceType: 'Project', quantifier: 'any', constraint: { type: 'always' } }, ids: ['d01', 'd02', 'd03', 'd05', 'd06', 'd07', 'd08'] },
      ]) {
        await proof.check(`${backend}-manual-${test.id}`, { constraint: test.node }, test.ids, async () => {
          const node = { ...test.node, rootResourceType: 'Document' };
          const translated = instance.translateConstraints(node, backend === 'prisma' ? prismaAdapter() : drizzleAdapter());
          translations.push({ case: test.id, backend, result: node, translated: backend === 'prisma' ? translated : sanitize(translated) });
          return backend === 'prisma' ? ids(await prisma.document.findMany({ where: translated, orderBy: { id: 'asc' } })) : ids(await db.select().from(tables.Document).where(lower(translated, db)).orderBy(asc(tables.Document.id)));
        });
      }
      for (const test of [
        { id: 'field-to-field', when: { '$resource.title': '$resource.tenant' } },
        { id: 'custom-policy', when: { '$resource.title': { custom: 'external-decision' } } },
      ]) {
        await proof.check(`${backend}-reject-${test.id}-before-query`, { when: test.when }, { error: 'UnsupportedConstraintError', queryCountChange: 0 }, async () => {
          const before = sqlEvents[backend].length;
          let error;
          try {
            const instance = new Toride({ policy: await loadJson(JSON.stringify(policy({ rules: [{ effect: 'permit', permissions: ['read'], when: test.when }] }))) });
            const result = await instance.buildConstraints(actor, 'read', 'Document');
            assert(result.ok && result.constraint, 'Unsupported policy must not become unrestricted or an ordinary result');
            instance.translateConstraints(result.constraint, backend === 'prisma' ? prismaAdapter() : drizzleAdapter());
          } catch (caught) { error = caught.name; }
          return { error, queryCountChange: sqlEvents[backend].length - before };
        });
      }
    }
    for (const backend of ['prisma', 'drizzle']) {
      for (const unsupported of [
        { id: 'custom', node: { type: 'unknown', name: 'external-decision', rootResourceType: 'Document' } },
        { id: 'legacy-has-role', node: { type: 'has_role', actorId: 'u1', actorType: 'User', role: 'viewer', rootResourceType: 'Document' } },
      ]) {
        await proof.check(`${backend}-reject-${unsupported.id}-before-query`, unsupported.node, { error: 'UnsupportedConstraintError', queryCountChange: 0 }, async () => {
          const instance = new Toride({ policy: await loadJson(JSON.stringify(policy({ rules: [] }))) });
          const before = sqlEvents[backend].length;
          let error;
          try { instance.translateConstraints(unsupported.node, backend === 'prisma' ? prismaAdapter() : drizzleAdapter()); } catch (caught) { error = caught.name; }
          return { error, queryCountChange: sqlEvents[backend].length - before };
        });
      }
    }
  }
} catch (error) {
  await proof.check('local-database-setup', { prismaVersion: '6.19.2', engine: 'js', url: `file:${scratch}/prisma.db` }, { ready: true }, async () => { throw error; });
} finally {
  if (prisma) await prisma.$disconnect();
  writeFileSync(join(evidence, `${feature}-sql.json`), JSON.stringify(sqlEvents, null, 2) + '\n');
  writeFileSync(join(evidence, `${feature}-translations.json`), JSON.stringify(translations, null, 2) + '\n');
  writeFileSync(join(evidence, `${feature}-fixture.json`), JSON.stringify({ actor, rows, projects, users, reviewers }, null, 2) + '\n');
  proof.finish();
}
