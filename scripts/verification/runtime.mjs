#!/usr/bin/env node
import { Toride, loadJson } from 'toride';
import { TorideClient } from 'toride/client';
import { recorder } from './support.mjs';

const feature = process.argv[2];
const proof = recorder(feature);
const actor = { type: 'User', id: 'u1', attributes: { enabled: true, level: 3 } };
const ref = { type: 'Document', id: 'd1' };
const resource = { roles: ['viewer'], permissions: ['read'], attributes: { blocked: 'boolean', reviewer: 'string', tenant: 'string', secret: 'string' } };
async function engine(document, resolvers = {}, extra = {}) {
  const input = { version: '1', actors: { User: { attributes: { enabled: 'boolean', level: 'number', tenant: 'string' } } }, resources: { Document: { ...resource, ...document } }, ...extra };
  return new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers });
}
const permit = { effect: 'permit', permissions: ['read'], when: { '$actor.enabled': true } };
const forbid = { effect: 'forbid', permissions: ['read'], when: { '$resource.blocked': true } };
const throws = async () => { throw new Error('verification document storage unavailable'); };

if (feature === 'decisions') {
  await proof.check('failed-forbid-denies', { actor, ref, rules: [permit, forbid], resolverOutcomes: ['clear', 'blocked', 'throws'] }, [true, false, false], async () => {
    const engines = await Promise.all([{ blocked: false }, { blocked: true }].map((data) => engine({ rules: [permit, forbid] }, { Document: async () => data })));
    engines.push(await engine({ rules: [permit, forbid] }, { Document: throws }));
    return Promise.all(engines.map((instance) => instance.can(actor, 'read', ref)));
  });
  await proof.check('explain-preserves-resolver-failure', { actor, ref, rules: [permit, forbid], resolver: 'throws' }, { allowed: false, diagnostic: true }, async () => {
    const instance = await engine({ rules: [permit, forbid] }, { Document: throws });
    const explanation = await instance.explain(actor, 'read', ref);
    return { allowed: explanation.allowed, diagnostic: /resolver|resolution|unavailable/i.test(JSON.stringify(explanation.diagnostics ?? [])) };
  });
  await proof.check('failed-role-scoped-forbid-denies', { actor, ref, role: 'viewer' }, [true, false, false], async () => {
    const definition = { grants: { viewer: ['read'] }, derived_roles: [{ role: 'viewer', when: { '$actor.enabled': true } }], rules: [{ ...forbid, roles: ['viewer'] }] };
    const engines = await Promise.all([engine(definition, { Document: async () => ({ blocked: false }) }), engine(definition, { Document: async () => ({ blocked: true }) }), engine(definition, { Document: throws })]);
    return Promise.all(engines.map((instance) => instance.can(actor, 'read', ref)));
  });
  await proof.check('exists-distinguishes-null-from-unavailable', { field: 'reviewer', values: [null, 'u2', 'omitted', 'throws'] }, [true, false, false, false], async () => {
    const definition = { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.reviewer': { exists: false } } }] };
    const engines = await Promise.all([engine(definition, { Document: async () => ({ reviewer: null }) }), engine(definition, { Document: async () => ({ reviewer: 'u2' }) }), engine(definition, { Document: async () => ({}) }), engine(definition, { Document: throws })]);
    return Promise.all(engines.map((instance) => instance.can(actor, 'read', ref)));
  });
  await proof.check('missing-static-values-do-not-disable-forbid', { omitted: ['actor.tenant', 'env.tenant'], inlineTenant: 'alpha' }, [true, false, false, false], async () => {
    const instance = await engine({ rules: [permit, { effect: 'forbid', permissions: ['read'], when: { '$resource.tenant': '$env.tenant' } }] });
    const target = { ...ref, attributes: { tenant: 'alpha' } };
    const missing = await engine({ rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.tenant': '$actor.tenant' } }] });
    return [await instance.can(actor, 'read', target, { env: { tenant: 'beta' } }), await instance.can(actor, 'read', target, { env: { tenant: 'alpha' } }), await instance.can(actor, 'read', target), await missing.can(actor, 'read', target)];
  });
  await proof.check('known-permit-or-unavailable-permit', { rules: [permit, { effect: 'permit', permissions: ['read'], when: { '$resource.blocked': false } }] }, [true, false], async () => {
    const instance = await engine({ rules: [permit, { effect: 'permit', permissions: ['read'], when: { '$resource.blocked': false } }] }, { Document: throws });
    return [await instance.can(actor, 'read', ref), await instance.can({ ...actor, attributes: { enabled: false } }, 'read', ref)];
  });
  await proof.check('global-and-local-operator-parity', { operator: 'gte', threshold: 2, levels: [3, 1] }, [true, true, false, false], async () => {
    const instance = await engine({ roles: ['global_reader', 'local_reader'], permissions: ['read_global', 'read_local'], grants: { global_reader: ['read_global'], local_reader: ['read_local'] }, derived_roles: [{ role: 'global_reader', from_global_role: 'qualified' }, { role: 'local_reader', when: { '$actor.level': { gte: 2 } } }] }, {}, { global_roles: { qualified: { actor_type: 'User', when: { '$actor.level': { gte: 2 } } } } });
    const below = { ...actor, attributes: { level: 1 } };
    return Promise.all([instance.can(actor, 'read_global', ref), instance.can(actor, 'read_local', ref), instance.can(below, 'read_global', ref), instance.can(below, 'read_local', ref)]);
  });
  for (const actorType of [false, true]) {
    await proof.check(`derived-role-env-${actorType ? 'actor-type' : 'condition'}`, { env: [true, false, 'omitted'] }, [true, false, false], async () => {
      const derivation = { role: 'viewer', when: { '$env.featureEnabled': true }, ...(actorType ? { actor_type: 'User' } : {}) };
      const instance = await engine({ grants: { viewer: ['read'] }, derived_roles: [derivation] });
      return Promise.all([instance.can(actor, 'read', ref, { env: { featureEnabled: true } }), instance.can(actor, 'read', ref, { env: { featureEnabled: false } }), instance.can(actor, 'read', ref)]);
    });
  }
  await proof.check('related-roles-bind-declared-target', { relation: 'org', declaredTarget: 'Organization', targets: ['public', 'private', 'Workspace'] }, { decisions: [true, false, false], roles: ['viewer'], actions: ['read'] }, async () => {
    const input = { version: '1', actors: { User: { attributes: { enabled: 'boolean' } } }, resources: {
      Document: { roles: ['viewer'], permissions: ['read'], relations: { org: 'Organization' }, grants: { viewer: ['read'] }, derived_roles: [{ role: 'viewer', from_role: 'member', on_relation: 'org' }] },
      Organization: { roles: ['member'], permissions: ['read'], attributes: { isPublic: 'boolean' }, grants: { member: ['read'] }, derived_roles: [{ role: 'member', when: { '$resource.isPublic': true } }] },
      Workspace: { roles: ['member'], permissions: ['read'], grants: { member: ['read'] }, derived_roles: [{ role: 'member', when: { '$actor.enabled': true } }] },
    } };
    const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: { Document: async ({ id }) => ({ org: { type: id === 'wrong' ? 'Workspace' : 'Organization', id } }), Organization: async ({ id }) => ({ isPublic: id === 'public' }) } });
    const allowed = { type: 'Document', id: 'public' };
    return { decisions: await Promise.all(['public', 'private', 'wrong'].map((id) => instance.can(actor, 'read', { type: 'Document', id }))), roles: await instance.resolvedRoles(actor, allowed), actions: await instance.permittedActions(actor, allowed) };
  });
  await proof.check('unavailable-traversal-distinguishes-null-one-from-empty-many', { staticOperand: '$env.missing', one: null, many: [] }, [false, true], async () => {
    const results = [];
    for (const [relation, target, field, value] of [['project', 'Project', 'isPublic', null], ['reviewers', 'Reviewer', 'approved', []]]) {
      const input = { version: '1', actors: { User: { attributes: {} } }, resources: {
        Document: { roles: [], permissions: ['read'], relations: { [relation]: target }, rules: [{ effect: 'permit', permissions: ['read'], when: {} }, { effect: 'forbid', permissions: ['read'], when: { [`$resource.${relation}.${field}`]: '$env.missing' } }] },
        [target]: { roles: [], permissions: ['read'], attributes: { [field]: 'boolean' } },
      } };
      const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: { Document: async () => ({ [relation]: value }) } });
      results.push(await instance.can(actor, 'read', ref));
    }
    return results;
  });
  for (const reversed of [false, true]) {
    await proof.check(`absent-related-id-${reversed ? 'forbid-first' : 'permit-first'}`, { relatedRef: { type: 'Project', id: 'gone' }, resolverOutcomes: ['clear', 'blocked', 'null'], reversed }, [true, false, false], async () => {
      const rules = [{ effect: 'permit', permissions: ['read'], when: { '$resource.project.id': 'gone' } }, { effect: 'forbid', permissions: ['read'], when: { '$resource.project.blocked': true } }];
      const input = { version: '1', actors: { User: { attributes: {} } }, resources: {
        Document: { roles: [], permissions: ['read'], relations: { project: 'Project' }, rules: reversed ? [...rules].reverse() : rules },
        Project: { roles: [], permissions: ['read'], attributes: { blocked: 'boolean' } },
      } };
      const results = [];
      for (const data of [{ blocked: false }, { blocked: true }, null]) {
        const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: { Document: async () => ({ project: { type: 'Project', id: 'gone' } }), Project: async () => data } });
        results.push(await instance.can(actor, 'read', ref));
      }
      return results;
    });
  }
  await proof.check('derived-role-depth-preserves-each-traversal-context', { roleOrders: [['warm', 'viewer'], ['viewer', 'warm']], effects: ['permit', 'forbid'], maxDepth: [2, 3] }, { shallow: [false, false, false, false], deep: [true, true, true, true], depthDiagnostics: [true, true, true, true] }, async () => {
    const shallow = [], deep = [], depthDiagnostics = [];
    for (const effect of ['permit', 'forbid']) {
      for (const roles of [['warm', 'viewer'], ['viewer', 'warm']]) {
        const input = { version: '1', actors: { User: { attributes: { enabled: 'boolean' } } }, resources: {
          Document: { roles, permissions: ['read'], relations: { fast: 'Member', middle: 'Bridge' }, derived_roles: [{ role: 'warm', from_role: 'member', on_relation: 'fast' }, { role: 'viewer', from_role: 'bridge', on_relation: 'middle' }], ...(effect === 'permit' ? { grants: { viewer: ['read'] } } : { rules: [{ effect: 'permit', permissions: ['read'], when: {} }, { effect: 'forbid', permissions: ['read'], roles: ['viewer'], when: {} }] }) },
          Bridge: { roles: ['bridge'], permissions: ['read'], relations: { member: 'Member' }, derived_roles: [{ role: 'bridge', from_role: 'member', on_relation: 'member' }] },
          Member: { roles: ['member'], permissions: ['read'], relations: { tail: 'Tail' }, derived_roles: [{ role: 'member', from_role: 'tail', on_relation: 'tail' }] },
          Tail: { roles: ['tail'], permissions: ['read'], derived_roles: [{ role: 'tail', when: { '$actor.enabled': effect === 'permit' } }] },
        } };
        const loaded = await loadJson(JSON.stringify(input));
        const resolvers = { Document: async () => ({ fast: { type: 'Member', id: 'm1' }, middle: { type: 'Bridge', id: 'b1' } }), Bridge: async () => ({ member: { type: 'Member', id: 'm1' } }), Member: async () => ({ tail: { type: 'Tail', id: 't1' } }) };
        const limited = new Toride({ policy: loaded, resolvers, maxDerivedRoleDepth: 2 });
        const explanation = await limited.explain(actor, 'read', ref);
        shallow.push(await limited.can(actor, 'read', ref));
        depthDiagnostics.push(explanation.allowed === false && explanation.diagnostics.some((entry) => entry.code === 'depth_limit' && entry.path === 'Tail.tail'));
        deep.push(await new Toride({ policy: loaded, resolvers, maxDerivedRoleDepth: 3 }).can(actor, 'read', ref));
      }
    }
    return { shallow, deep, depthDiagnostics };
  });
  await proof.check('role-cycle-assumptions-stay-within-their-branch', { roleOrders: [['warm', 'viewer'], ['viewer', 'warm']], cycle: 'A -> Target -> A', independentRoute: 'B -> Target -> A' }, [true, true], async () => {
    const results = [];
    for (const roles of [['warm', 'viewer'], ['viewer', 'warm']]) {
      const input = { version: '1', actors: { User: { attributes: {} } }, resources: {
        Document: { roles, permissions: ['read'], relations: { a: 'A', b: 'B' }, derived_roles: [{ role: 'warm', from_role: 'member', on_relation: 'a' }, { role: 'viewer', from_role: 'member', on_relation: 'b' }], grants: { viewer: ['read'] } },
        A: { roles: ['member'], permissions: ['read'], relations: { target: 'Target' }, derived_roles: [{ role: 'member', from_role: 'member', on_relation: 'target' }, { role: 'member', when: {} }] },
        B: { roles: ['member'], permissions: ['read'], relations: { target: 'Target' }, derived_roles: [{ role: 'member', from_role: 'member', on_relation: 'target' }] },
        Target: { roles: ['member'], permissions: ['read'], relations: { a: 'A' }, derived_roles: [{ role: 'member', from_role: 'member', on_relation: 'a' }] },
      } };
      const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: { Document: async () => ({ a: { type: 'A', id: 'a1' }, b: { type: 'B', id: 'b1' } }), A: async () => ({ target: { type: 'Target', id: 't1' } }), B: async () => ({ target: { type: 'Target', id: 't1' } }), Target: async () => ({ a: { type: 'A', id: 'a1' } }) } });
      results.push(await instance.can(actor, 'read', ref));
    }
    return results;
  });
} else if (feature === 'fields-batch-client') {
  const instance = await engine({ grants: { viewer: ['read'] }, derived_roles: [{ role: 'viewer', when: { '$actor.enabled': true } }], rules: [forbid], field_access: { secret: { read: ['viewer'] } } });
  const clear = { ...ref, id: 'clear', attributes: { blocked: false } };
  const blocked = { ...ref, id: 'blocked', attributes: { blocked: true } };
  await proof.check('resource-denial-bounds-fields', { actor, clear, blocked }, { decisions: [true, true, false, false], fields: [['secret'], []] }, async () => ({ decisions: await Promise.all([instance.can(actor, 'read', clear), instance.canField(actor, 'read', clear, 'secret'), instance.can(actor, 'read', blocked), instance.canField(actor, 'read', blocked, 'secret')]), fields: [await instance.permittedFields(actor, 'read', clear), await instance.permittedFields(actor, 'read', blocked)] }));
  await proof.check('snapshot-and-client-resource-denial', { actor, resources: [clear, blocked] }, { snapshot: { 'Document:clear': ['read'], 'Document:blocked': [] }, client: [true, false, false], actions: ['read'] }, async () => {
    const snapshot = await instance.snapshot(actor, [clear, blocked]);
    const client = new TorideClient(snapshot);
    return { snapshot, client: [client.can('read', clear), client.can('read', blocked), client.can('read', { ...ref, id: 'missing' })], actions: client.permittedActions(clear) };
  });
  for (const refDependent of [false, true]) {
    await proof.check(`batch-order-${refDependent ? 'ref-dependent-resolver' : 'inline'}`, { repeatedIdentity: ref, values: [true, false] }, { single: [true, false], forward: [true, false], reverse: [false, true] }, async () => {
      const instance = await engine({ rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.blocked': false } }] }, refDependent ? { Document: async (target) => ({ blocked: !target.attributes.enabled }) } : {});
      const refs = [true, false].map((enabled) => ({ ...ref, attributes: refDependent ? { enabled } : { blocked: !enabled } }));
      return { single: await Promise.all(refs.map((target) => instance.can(actor, 'read', target))), forward: await instance.canBatch(actor, refs.map((target) => ({ action: 'read', resource: target }))), reverse: await instance.canBatch(actor, [...refs].reverse().map((target) => ({ action: 'read', resource: target }))) };
    });
  }
  const actionExpected = { single: [true, false], actions: ['inspect'], snapshot: { 'Document:d1': ['inspect'] }, client: [true, false] };
  await proof.check('action-enumeration-isolates-observations', { permissionOrders: [['inspect', 'read'], ['read', 'inspect']], projectValues: [null, { value: null }] }, [actionExpected, actionExpected, actionExpected, actionExpected], async () => {
    const results = [];
    for (const absent of [true, false]) {
      for (const permissions of [['inspect', 'read'], ['read', 'inspect']]) {
        const input = { version: '1', actors: { User: { attributes: {} } }, resources: {
          Document: { roles: ['viewer'], permissions, relations: { project: 'Project' }, derived_roles: [{ role: 'viewer', from_role: 'viewer', on_relation: 'project' }], rules: [{ effect: 'permit', permissions: ['inspect'], when: { '$resource.project.value': { exists: false } } }, { effect: 'permit', permissions: ['read'], when: {} }, { effect: 'forbid', permissions: ['read'], roles: ['viewer'], when: {} }] },
          Project: { roles: ['viewer'], permissions: ['read'], attributes: { value: 'string' }, derived_roles: [{ role: 'viewer', when: {} }] },
        } };
        const instance = new Toride({ policy: await loadJson(JSON.stringify(input)), resolvers: { Document: async () => ({ project: { type: 'Project', id: 'p1' } }), Project: async () => absent ? null : { value: null } } });
        const single = await Promise.all(['inspect', 'read'].map((action) => instance.can(actor, action, ref)));
        const actions = await instance.permittedActions(actor, ref);
        const snapshot = await instance.snapshot(actor, [ref]);
        const client = new TorideClient(snapshot);
        results.push({ single, actions, snapshot, client: ['inspect', 'read'].map((action) => client.can(action, ref)) });
      }
    }
    return results;
  });
} else throw new Error(`Unknown runtime feature ${feature}`);
proof.finish();
