#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const helpers = join(root, 'scripts/verification');
const packages = { toride: 'toride', '@toride/prisma': 'prisma', '@toride/drizzle': 'drizzle', '@toride/codegen': 'codegen' };
const features = ['decisions', 'fields-batch-client', 'queries', 'orm-resolvers', 'types-and-policy'];
const hash = (contents) => createHash('sha256').update(contents).digest('hex');
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
function inventory() {
  const tracked = git('ls-files', '-z', 'packages', 'examples/prisma-app', 'scripts/verification', '.claude/skills/verify-toride', 'pnpm-lock.yaml', 'package.json', 'nx.json', 'tsconfig.json').split('\0').filter(Boolean);
  const files = new Set(tracked);
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.add(path.slice(root.length + 1));
    }
  }
  for (const name of Object.values(packages)) walk(join(root, 'packages', name, 'dist'));
  walk(helpers);
  walk(join(root, 'examples/prisma-app/verification'));
  walk(join(root, 'packages/drizzle/verification'));
  walk(join(root, '.claude/skills/verify-toride'));
  const hashes = Object.fromEntries([...files].sort().filter((path) => existsSync(join(root, path))).map((path) => [path, hash(readFileSync(join(root, path)))]));
  return { head: git('rev-parse', 'HEAD').trim(), status: git('status', '--short'), diffSha256: hash(git('diff', 'HEAD')), files: hashes };
}
function command(run, label, executable, args, options = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', ...options });
  const record = { executable, args, cwd: options.cwd ?? root, started, finished: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message };
  writeFileSync(join(run, `${label}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  json(join(run, `${label}.command.json`), record);
  if (result.status !== 0) process.stderr.write(`Failed ${label}. Read ${join(run, `${label}.log`)}\n`);
  return result.status ?? 1;
}
function state(run) {
  const data = JSON.parse(readFileSync(join(run, 'run.json'), 'utf8'));
  assert.equal(data.root, root, 'This run belongs to another checkout');
  return data;
}
function linkModule(scratch, name, target) {
  const path = join(scratch, 'node_modules', name);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(target)) symlinkSync(target, path, 'dir');
}
function launch(parent) {
  const destination = resolve(parent ?? join(tmpdir(), 'toride-verification-evidence'));
  assert(destination !== root && !destination.startsWith(`${root}/`), 'Evidence must be outside the checkout');
  mkdirSync(destination, { recursive: true });
  const run = mkdtempSync(join(destination, 'run-'));
  const scratch = mkdtempSync(join(tmpdir(), 'toride-verify-'));
  const token = randomUUID();
  json(join(scratch, 'owner.json'), { run, token });
  json(join(scratch, 'package.json'), { private: true, type: 'module' });
  json(join(run, 'run.json'), { root, run, scratch, token, created: new Date().toISOString(), cleaned: false });
  try {
    const status = command(run, 'launch-build', 'pnpm', ['exec', 'nx', 'run-many', '-t', 'build', '--projects=toride,@toride/prisma,@toride/drizzle,@toride/codegen'], { env: { ...process.env, NX_DAEMON: 'false' } });
    assert.equal(status, 0, 'Launch build failed');
    for (const [name, dir] of Object.entries(packages)) linkModule(scratch, name, join(root, 'packages', dir));
    for (const name of ['@prisma/client', '@prisma/adapter-libsql', 'prisma']) linkModule(scratch, name, join(root, 'examples/prisma-app/node_modules', name));
    linkModule(scratch, 'drizzle-orm', join(root, 'packages/drizzle/node_modules/drizzle-orm'));
    linkModule(scratch, '@types', join(root, 'node_modules/@types'));
    for (const file of readdirSync(helpers).filter((name) => /\.(mjs|py|prisma|ts)$/.test(name) && name !== 'run.mjs')) {
      writeFileSync(join(scratch, file), readFileSync(join(helpers, file)));
    }
    json(join(run, 'identity.json'), { ...inventory(), node: process.version, sqlite: spawnSync('python3', ['-c', 'import sqlite3; print(sqlite3.sqlite_version)'], { encoding: 'utf8' }).stdout.trim() });
    console.log(run);
    return run;
  } catch (error) {
    cleanup(run);
    throw new Error(`${error.message}. Evidence ${run}`, { cause: error });
  }
}
function doctor(run) {
  const data = state(run);
  assert.equal(data.cleaned, false, 'The run is already cleaned');
  assert.deepEqual(JSON.parse(readFileSync(join(data.scratch, 'owner.json'), 'utf8')), { run, token: data.token });
  const prior = JSON.parse(readFileSync(join(run, 'identity.json'), 'utf8'));
  const current = inventory();
  assert.deepEqual(current, { head: prior.head, status: prior.status, diffSha256: prior.diffSha256, files: prior.files }, 'Source or built artifacts changed. Launch a fresh run');
  const status = command(run, 'doctor', process.execPath, [join(data.scratch, 'doctor.mjs')], { cwd: data.scratch, env: { ...process.env, TORIDE_VERIFY_EVIDENCE: run, TORIDE_VERIFY_SCRATCH: data.scratch, TORIDE_VERIFY_ROOT: root } });
  assert.equal(status, 0, 'Public ESM imports or local prerequisites failed');
  console.log(`READY ${run}`);
}
function drive(feature, run) {
  assert(features.includes(feature), `Unknown feature ${feature}`);
  doctor(run);
  const data = state(run);
  return command(run, `drive-${feature}`, process.execPath, [join(data.scratch, feature === 'decisions' || feature === 'fields-batch-client' ? 'runtime.mjs' : feature === 'types-and-policy' ? 'types.mjs' : 'queries.mjs'), feature], { cwd: data.scratch, env: { ...process.env, TORIDE_VERIFY_EVIDENCE: run, TORIDE_VERIFY_SCRATCH: data.scratch, TORIDE_VERIFY_ROOT: root, LOCAL_PRISMA_URL: `file:${data.scratch}/prisma.db` } });
}
function evidence(run) {
  state(run);
  const files = readdirSync(run).filter((file) => file !== 'evidence.json');
  assert(files.includes('identity.json'), 'Missing identity evidence');
  const results = files.filter((file) => features.some((feature) => file === `${feature}.json`)).map((file) => JSON.parse(readFileSync(join(run, file), 'utf8')));
  const checks = results.flatMap(({ cases }) => cases);
  const commands = files.filter((file) => file.startsWith('drive-') && file.endsWith('.command.json')).map((file) => ({ feature: file.slice(6, -13), ...JSON.parse(readFileSync(join(run, file), 'utf8')) }));
  const report = { run, features: results.map(({ feature }) => feature), checks: checks.length, failures: checks.filter((entry) => !entry.passed).map(({ id }) => id), failedCommands: commands.filter(({ exitCode }) => exitCode !== 0), missingResults: commands.filter(({ feature }) => !results.some((result) => result.feature === feature)).map(({ feature }) => feature), hashes: Object.fromEntries(files.map((file) => [file, hash(readFileSync(join(run, file)))])) };
  json(join(run, 'evidence.json'), report);
  console.log(JSON.stringify({ run, features: report.features, checks: report.checks, failures: report.failures, failedCommands: report.failedCommands.map(({ feature, exitCode }) => ({ feature, exitCode })), missingResults: report.missingResults }, null, 2));
}
function cleanup(run) {
  const data = state(run);
  if (!data.cleaned && existsSync(data.scratch)) {
    assert.equal(dirname(realpathSync(data.scratch)), realpathSync(tmpdir()), 'Scratch is outside the temporary directory');
    assert(data.scratch.startsWith(join(tmpdir(), 'toride-verify-')), 'Scratch lacks the owned prefix');
    assert.deepEqual(JSON.parse(readFileSync(join(data.scratch, 'owner.json'), 'utf8')), { run, token: data.token }, 'Scratch ownership does not match');
    rmSync(data.scratch, { recursive: true });
  }
  json(join(run, 'run.json'), { ...data, cleaned: true, cleanedAt: new Date().toISOString() });
  json(join(run, 'cleanup.json'), { scratchRemoved: !existsSync(data.scratch), retainedFiles: readdirSync(run).sort() });
  console.log(`CLEAN ${run}`);
}

const [action, first, second] = process.argv.slice(2);
try {
  if (action === 'launch') launch(first);
  else if (action === 'doctor') doctor(resolve(first));
  else if (action === 'drive') process.exitCode = drive(first, resolve(second));
  else if (action === 'evidence') evidence(resolve(first));
  else if (action === 'cleanup') cleanup(resolve(first));
  else if (action === 'check') {
    const run = launch(second);
    try {
      const selected = first === 'all' ? features : [first];
      for (const feature of selected) process.exitCode = Math.max(process.exitCode ?? 0, drive(feature, run));
    } finally { cleanup(run); }
    evidence(run);
    assert(existsSync(join(run, 'identity.json')) && existsSync(join(run, 'evidence.json')), 'Evidence did not survive cleanup');
  } else throw new Error('Usage: verify.sh launch [evidence-parent] | doctor RUN | drive FEATURE RUN | evidence RUN | cleanup RUN | check FEATURE [evidence-parent]');
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
