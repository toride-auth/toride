import assert from 'node:assert/strict';
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

export async function createDatabase({ scratch, evidence, feature, events }) {
  const directory = dirname(fileURLToPath(import.meta.url));
  for (const file of ['schema.prisma', 'prisma.config.ts']) copyFileSync(join(directory, file), join(scratch, file));
  const url = `file:${scratch}/${feature}-prisma.db`;
  const executable = process.execPath;
  const args = [join(directory, '../node_modules/prisma/build/index.js'), 'generate'];
  const generation = spawnSync(executable, args, { cwd: scratch, encoding: 'utf8', env: { ...process.env, LOCAL_PRISMA_URL: url } });
  writeFileSync(join(evidence, `${feature}-prisma-generate.log`), generation.stdout + generation.stderr);
  writeFileSync(join(evidence, `${feature}-prisma-generate.command.json`), JSON.stringify({ executable, args, cwd: scratch, exitCode: generation.status }, null, 2));
  assert.equal(generation.status, 0, 'Scratch Prisma Client generation failed');
  const { PrismaClient } = await import(pathToFileURL(join(scratch, 'generated/index.js')).href);
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL({ url }), log: [{ emit: 'event', level: 'query' }] });
  prisma.$on('query', ({ query, params }) => events.push({ query, params }));
  return prisma;
}
