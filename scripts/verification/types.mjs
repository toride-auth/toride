#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateTypes } from '@toride/codegen';
import { loadJson, loadYaml } from 'toride';
import { recorder, evidence, scratch } from './support.mjs';

const root = process.env.TORIDE_VERIFY_ROOT;
const proof = recorder('types-and-policy');
const input = { version: '1', actors: { User: { attributes: { enabled: 'boolean' } } }, resources: {
  Document: { roles: ['viewer'], permissions: ['read'], attributes: { tenant: 'string', blocked: 'boolean' }, relations: { org: 'Organization' }, derived_roles: [{ role: 'viewer', when: { '$actor.enabled': true } }], grants: { viewer: ['read'] } },
  Organization: { roles: ['member'], permissions: ['manage'], attributes: { plan: 'string' } },
} };
writeFileSync(join(scratch, 'policy.json'), JSON.stringify(input, null, 2));
writeFileSync(join(evidence, 'type-policy.json'), JSON.stringify(input, null, 2));
writeFileSync(join(scratch, 'invalid-policy.json'), JSON.stringify({ version: '1', actors: {}, resources: { Broken: { permissions: ['read'] } } }));
function invoke(id, executable, args) {
  const result = spawnSync(executable, args, { cwd: scratch, encoding: 'utf8' });
  writeFileSync(join(evidence, `${id}.log`), result.stdout + result.stderr);
  writeFileSync(join(evidence, `${id}.command.json`), JSON.stringify({ executable, args, cwd: scratch, exitCode: result.status, error: result.error?.message }, null, 2));
  return result;
}
const coreCli = join(root, 'packages/toride/dist/cli.js');
const codegenCli = join(root, 'packages/codegen/dist/cli.js');
await proof.check('policy-cli-valid', input, { exitCode: 0, valid: true }, async () => {
  const result = invoke('policy-cli-valid', process.execPath, [coreCli, 'validate', join(scratch, 'policy.json')]);
  return { exitCode: result.status, valid: result.stdout.includes('Policy is valid.') };
});
await proof.check('policy-cli-invalid', { invalidFile: 'invalid-policy.json' }, { exitCode: 1, error: true }, async () => {
  const result = invoke('policy-cli-invalid', process.execPath, [coreCli, 'validate', join(scratch, 'invalid-policy.json')]);
  return { exitCode: result.status, error: result.stderr.includes('Error:') };
});
await proof.check('codegen-cli-and-api', input, { exitCode: 0, matchesApi: true }, async () => {
  const result = invoke('codegen-cli', process.execPath, [codegenCli, join(scratch, 'policy.json'), '-o', join(scratch, 'generated.ts')]);
  const expected = generateTypes(await loadJson(JSON.stringify(input)));
  const generated = readFileSync(join(scratch, 'generated.ts'), 'utf8');
  writeFileSync(join(evidence, 'generated.ts'), generated);
  return { exitCode: result.status, matchesApi: generated === expected };
});
const examplePolicy = readFileSync(join(root, 'examples/prisma-app/policy.yaml'), 'utf8');
writeFileSync(join(scratch, 'example-generated.ts'), generateTypes(await loadYaml(examplePolicy)));
writeFileSync(join(evidence, 'example-generated.ts'), readFileSync(join(scratch, 'example-generated.ts')));
const prelude = `import { Toride, type ResourceResolver, type ConstraintAdapter } from 'toride';
import { createPrismaResolver, createPrismaAdapter } from '@toride/prisma';
import { type GeneratedSchema } from './generated.js';
declare const engine: Toride<GeneratedSchema>;
const actor = { type: 'User' as const, id: 'u1', attributes: { enabled: true } };
type QueryMap = { Document: { tenant?: string }; Organization: { plan?: string } };
declare const adapter: ConstraintAdapter<QueryMap>;
`;
const cases = [
  { id: 'valid-generated-consumer', source: `const resolver: ResourceResolver<GeneratedSchema,'Document'> = async () => ({tenant:'alpha', org:{type:'Organization',id:'o1'}});\nengine.can(actor,'read',{type:'Document',id:'d1'});\nasync function query(){const result=await engine.buildConstraints(actor,'read','Document');if(result.ok && result.constraint){const where:{tenant?:string}=engine.translateConstraints(result.constraint,adapter);}}`, positive: true },
  { id: 'reject-wrong-resolver-attribute', source: `const resolver: ResourceResolver<GeneratedSchema,'Document'> = async () => ({tenant:123});` },
  { id: 'reject-wrong-relation-target', source: `const resolver: ResourceResolver<GeneratedSchema,'Document'> = async () => ({org:{type:'Document',id:'d1'}});` },
  { id: 'reject-wrong-actor-attribute', source: `engine.can({type:'User',id:'u1',attributes:{enabled:'yes'}},'read',{type:'Document',id:'d1'});` },
  { id: 'reject-wrong-action-resource', source: `engine.can(actor,'manage',{type:'Document',id:'d1'});` },
  { id: 'reject-cross-resource-translation', source: `async function run(){const result=await engine.buildConstraints(actor,'read','Document'); if(result.ok && result.constraint) { engine.translateConstraints<'Organization',QueryMap>(result.constraint,adapter); }}` },
  { id: 'reject-selected-helper-complete-claim', source: `const resolver=createPrismaResolver<GeneratedSchema,'Document'>({},'Document',{select:{tenant:true}}); async function run(){ const selected=await resolver({type:'Document',id:'d1'}); if(selected){const blocked:boolean=selected.blocked;} }` },
  { id: 'reject-wrong-scalar-binding', source: `createPrismaAdapter<GeneratedSchema>({fields:{Document:{tenant:{field:'tenant',type:'boolean',nullable:false}}}});` },
  { id: 'reject-wrong-relation-binding', source: `createPrismaAdapter<GeneratedSchema>({relations:{Document:{org:{field:'org',resourceType:'Document',cardinality:'one'}}}});` },
];
for (const test of cases) {
  const file = join(scratch, `${test.id}.ts`);
  writeFileSync(file, prelude + test.source + '\n');
  writeFileSync(join(evidence, `${test.id}.ts`), prelude + test.source + '\n');
  await proof.check(test.id, { source: test.source }, test.positive ? { exitCode: 0, hasDiagnostic: false } : { exitCode: 2, hasDiagnostic: true }, async () => {
    const result = invoke(test.id, process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', file, join(scratch, 'example-generated.ts')]);
    return { exitCode: result.status, hasDiagnostic: /error TS\d+:/.test(result.stdout + result.stderr) };
  });
}
proof.finish();
