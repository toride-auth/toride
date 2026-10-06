#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Toride, loadJson } from 'toride';
import { createPrismaAdapter, createPrismaResolver } from '@toride/prisma';
import { createDrizzleAdapter, createDrizzleResolver } from '@toride/drizzle';
import { recorder, evidence, scratch } from './support.mjs';
import { actor, rows, projects, users, reviewers, queryCases, policy, runtimeResolvers } from './fixtures.mjs';

const feature = process.argv[2];
const proof = recorder(feature);
const root = process.env.TORIDE_VERIFY_ROOT;
const sqlEvents = { prisma: [], drizzle: [] };
const translations = [];
const ids = (result) => result.map((row) => row.id);
const { createDatabase: createPrismaDatabase } = await import(pathToFileURL(join(root, 'examples/prisma-app/verification/database.mjs')).href);
const { createDatabase: createDrizzleDatabase, tables, lower, asc, count, getTableName, withMinimumRank } = await import(pathToFileURL(join(root, 'packages/drizzle/verification/database.mjs')).href);
const db = createDrizzleDatabase(scratch, feature, sqlEvents.drizzle);
const fields = {
  Document: Object.fromEntries(Object.entries({ id: ['string', false], tenant: ['string', false], blocked: ['boolean', false], title: ['string', true], rank: ['number', true], ownerId: ['string', true], projectId: ['string', true] }).map(([field, [type, nullable]]) => [field, { field, type, nullable, ...(type === 'string' ? { stringComparison: 'binary' } : {}) }])),
  Project: { id: { field: 'id', type: 'string', nullable: false, stringComparison: 'binary' }, isPublic: { field: 'isPublic', type: 'boolean', nullable: false } },
  User: { id: { field: 'id', type: 'string', nullable: false, stringComparison: 'binary' } },
  Reviewer: { userId: { field: 'userId', type: 'string', nullable: false, stringComparison: 'binary' }, approved: { field: 'approved', type: 'boolean', nullable: false } },
};
function prismaAdapter() {
  return createPrismaAdapter({ fields: { ...fields, Document: { ...fields.Document, title: { ...fields.Document.title, stringFilters: 'javascript' } } }, relations: { Document: { project: { field: 'project', resourceType: 'Project', cardinality: 'one' }, owner: { field: 'owner', resourceType: 'User', cardinality: 'one' }, reviewers: { field: 'reviewers', resourceType: 'Reviewer', cardinality: 'many' } }, Project: { documents: { field: 'documents', resourceType: 'Document', cardinality: 'many' } } }, virtualFields: { Document: { reviewerIds: { relation: 'reviewers', matchField: 'userId', cardinality: 'many', valueType: 'string', stringComparison: 'binary' } }, Project: { reviewerIds: { relation: 'documents', matchField: 'tenant', cardinality: 'many', valueType: 'string', stringComparison: 'binary' } } } });
}
function drizzleAdapter() {
  return createDrizzleAdapter(tables.Document, { resourceType: 'Document', resources: tables, relations: { Document: { project: { resourceType: 'Project', cardinality: 'one', sourceColumn: 'projectId', targetColumn: 'id' }, owner: { resourceType: 'User', cardinality: 'one', sourceColumn: 'ownerId', targetColumn: 'id' }, reviewers: { resourceType: 'Reviewer', cardinality: 'many', sourceColumn: 'id', targetColumn: 'documentId' } }, Project: { documents: { resourceType: 'Document', cardinality: 'many', sourceColumn: 'id', targetColumn: 'projectId' } } }, virtualFields: { Document: { reviewerIds: { relation: 'reviewers', matchField: 'userId' } }, Project: { reviewerIds: { relation: 'documents', matchField: 'tenant' } } } });
}
function sanitize(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) => ['table', 'relatedTable'].includes(key) && entry ? getTableName(entry) : entry));
}
const ddls = [
  'CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "isPublic" BOOLEAN NOT NULL)',
  'CREATE TABLE "User" ("id" TEXT PRIMARY KEY)',
  'CREATE TABLE "Document" ("id" TEXT PRIMARY KEY, "tenant" TEXT NOT NULL, "blocked" BOOLEAN NOT NULL, "title" TEXT, "rank" INTEGER, "ownerId" TEXT, "projectId" TEXT)',
  'CREATE TABLE "Reviewer" ("documentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "approved" BOOLEAN NOT NULL, PRIMARY KEY ("documentId", "userId"))',
];
let prisma;
try {
  prisma = await createPrismaDatabase({ scratch, evidence, feature, events: sqlEvents.prisma });
  for (const ddl of ddls) {
    await prisma.$executeRawUnsafe(ddl);
    await db.run(ddl);
  }
  for (const [table, data] of [['Project', projects], ['User', users], ['Document', rows], ['Reviewer', reviewers]]) {
    await prisma[table[0].toLowerCase() + table.slice(1)].createMany({ data });
    await db.insert(tables[table]).values(data);
  }
  await prisma.$executeRawUnsafe('PRAGMA case_sensitive_like = ON');
  await proof.check('prisma-read-connection-binary-like', { sql: "SELECT 'Alpha' LIKE 'Alpha' AS same, 'Alpha' LIKE 'ALPHA' AS different", afterFixtureTransactions: true }, { same: 1, different: 0 }, async () => {
    const [result] = await prisma.$queryRawUnsafe("SELECT 'Alpha' LIKE 'Alpha' AS same, 'Alpha' LIKE 'ALPHA' AS different");
    return { same: Number(result.same), different: Number(result.different) };
  });
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
      await proof.check(`${backend}-application-filter-before-pagination`, { policy: policy(queryCases[0].definition), filter: { rank: { gte: 4 } } }, { ids: ['d04', 'd08'], count: 2, first: ['d04', 'd08'], second: [], last: [] }, async () => {
        const instance = new Toride({ policy: await loadJson(JSON.stringify(policy(queryCases[0].definition))), resolvers: runtimeResolvers });
        const result = await instance.buildConstraints(actor, 'read', 'Document');
        assert(result.ok && result.constraint);
        const translated = instance.translateConstraints(result.constraint, backend === 'prisma' ? prismaAdapter() : drizzleAdapter());
        if (backend === 'prisma') {
          const where = { AND: [translated, { rank: { gte: 4 } }] };
          return { ids: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' } })), count: await prisma.document.count({ where }), first: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 0, take: 2 })), second: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 2, take: 2 })), last: ids(await prisma.document.findMany({ where, orderBy: { id: 'asc' }, skip: 3, take: 2 })) };
        }
        const where = withMinimumRank(lower(translated, db), 4);
        const select = () => db.select().from(tables.Document).where(where).orderBy(asc(tables.Document.id));
        return { ids: ids(await select()), count: (await db.select({ count: count() }).from(tables.Document).where(where))[0].count, first: ids(await select().limit(2).offset(0)), second: ids(await select().limit(2).offset(2)), last: ids(await select().limit(2).offset(3)) };
      });
    }
    for (const backend of ['prisma', 'drizzle']) {
      const instance = new Toride({ policy: await loadJson(JSON.stringify(policy({ rules: [] }))) });
      for (const test of [
        { id: 'not-always', node: { type: 'not', child: { type: 'always' } }, ids: [] },
        { id: 'or-always-never', node: { type: 'or', children: [{ type: 'always' }, { type: 'never' }] }, ids: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
        { id: 'double-not-always', node: { type: 'not', child: { type: 'not', child: { type: 'always' } } }, ids: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
        { id: 'relation-always-requires-existence', node: { type: 'relation', field: 'project', resourceType: 'Project', quantifier: 'any', constraint: { type: 'always' } }, ids: ['d01', 'd02', 'd03', 'd05', 'd06', 'd07', 'd08'] },
        { id: 'one-relation-never', node: { type: 'relation', field: 'project', resourceType: 'Project', quantifier: 'any', constraint: { type: 'never' } }, ids: [] },
        { id: 'many-relation-always', node: { type: 'relation', field: 'reviewers', resourceType: 'Reviewer', quantifier: 'any', constraint: { type: 'always' } }, ids: ['d01', 'd02', 'd05', 'd08'] },
        { id: 'many-relation-never', node: { type: 'relation', field: 'reviewers', resourceType: 'Reviewer', quantifier: 'any', constraint: { type: 'never' } }, ids: [] },
        { id: 'not-one-relation-always', node: { type: 'not', child: { type: 'relation', field: 'project', resourceType: 'Project', quantifier: 'any', constraint: { type: 'always' } } }, ids: ['d04'] },
        { id: 'not-many-relation-always', node: { type: 'not', child: { type: 'relation', field: 'reviewers', resourceType: 'Reviewer', quantifier: 'any', constraint: { type: 'always' } } }, ids: ['d03', 'd04', 'd06', 'd07'] },
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
        { id: 'unmapped-virtual', node: { type: 'field_includes', field: 'unmappedIds', value: 'u1', rootResourceType: 'Document' } },
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
