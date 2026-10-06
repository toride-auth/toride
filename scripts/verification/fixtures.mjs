export const actor = { type: 'User', id: 'u1', attributes: { enabled: true, tenant: 'alpha', userId: 'u1' } };
export const rows = [
  { id: 'd01', tenant: 'beta', blocked: false, title: 'Alpha middle Omega', rank: 1, ownerId: 'u1', projectId: 'public' },
  { id: 'd02', tenant: 'alpha', blocked: false, title: 'Alpha prefix', rank: 3, ownerId: 'u1', projectId: 'public' },
  { id: 'd03', tenant: 'alpha', blocked: true, title: 'prefix Alpha', rank: null, ownerId: 'u2', projectId: 'private' },
  { id: 'd04', tenant: 'alpha', blocked: false, title: null, rank: 4, ownerId: null, projectId: null },
  { id: 'd05', tenant: 'alpha', blocked: false, title: 'Alpha %_\\ suffix', rank: null, ownerId: 'u2', projectId: 'public' },
  { id: 'd06', tenant: 'beta', blocked: true, title: 'ALPHA prefix', rank: 2, ownerId: 'u1', projectId: 'private' },
  { id: 'd07', tenant: 'beta', blocked: false, title: 'middle Alpha end', rank: 4, ownerId: 'u2', projectId: 'private' },
  { id: 'd08', tenant: 'alpha', blocked: false, title: 'Omega Alpha', rank: 5, ownerId: 'u1', projectId: 'public' },
];
export const projects = [{ id: 'public', isPublic: true }, { id: 'private', isPublic: false }];
export const users = [{ id: 'u1' }, { id: 'u2' }];
export const reviewers = [
  { documentId: 'd01', userId: 'u1', approved: true },
  { documentId: 'd02', userId: 'u1', approved: false },
  { documentId: 'd02', userId: 'u2', approved: true },
  { documentId: 'd05', userId: 'u1', approved: true },
  { documentId: 'd05', userId: 'u2', approved: false },
  { documentId: 'd08', userId: 'u2', approved: true },
];
export const expectedPages = { ids: ['d02', 'd04', 'd05', 'd08'], count: 4, first: ['d02', 'd04'], second: ['d05', 'd08'], last: ['d08'] };
export const document = {
  roles: ['viewer', 'owner'], permissions: ['read'],
  attributes: { tenant: 'string', blocked: 'boolean', title: 'string', rank: 'number', ownerId: 'string', projectId: 'string' },
  relations: { project: 'Project', owner: 'User', reviewers: 'Reviewer' },
};
export function policy(definition) {
  return { version: '1', actors: { User: { attributes: { enabled: 'boolean', tenant: 'string', userId: 'string' } } }, resources: {
    Document: { ...document, ...definition },
    Project: { roles: ['member'], permissions: ['read'], attributes: { isPublic: 'boolean' }, derived_roles: [{ role: 'member', when: { '$resource.isPublic': true } }], grants: { member: ['read'] } },
    User: { roles: ['self'], permissions: ['read'] },
    Reviewer: { roles: ['approved'], permissions: ['read'], attributes: { userId: 'string', approved: 'boolean' }, derived_roles: [{ role: 'approved', when: { '$resource.userId': '$actor.userId', '$resource.approved': true } }], grants: { approved: ['read'] } },
  } };
}
export const runtimeResolvers = {
  Document: async ({ id }) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) return null;
    return { ...row, project: row.projectId === null ? null : { type: 'Project', id: row.projectId }, owner: row.ownerId === null ? null : { type: 'User', id: row.ownerId }, reviewers: reviewers.filter((entry) => entry.documentId === id).map((entry) => ({ type: 'Reviewer', id: `${entry.documentId}:${entry.userId}` })) };
  },
  Project: async ({ id }) => projects.find((entry) => entry.id === id) ?? null,
  User: async ({ id }) => users.find((entry) => entry.id === id) ?? null,
  Reviewer: async ({ id }) => reviewers.find((entry) => `${entry.documentId}:${entry.userId}` === id) ?? null,
};
export const queryCases = [
  { id: 'tenant-and-forbid', definition: { derived_roles: [{ role: 'viewer', when: { '$resource.tenant': '$actor.tenant' } }], grants: { viewer: ['read'] }, rules: [{ effect: 'forbid', permissions: ['read'], when: { '$resource.blocked': true } }] }, expected: expectedPages },
  { id: 'unguarded-permit', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.tenant': 'alpha' } }] }, ids: ['d02', 'd03', 'd04', 'd05', 'd08'] },
  { id: 'irrelevant-forbid-role-guard', definition: { derived_roles: [{ role: 'viewer', when: { '$actor.enabled': true } }], grants: { viewer: ['read'] }, rules: [{ effect: 'forbid', roles: ['owner'], permissions: ['read'], when: { '$resource.blocked': true } }] }, ids: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
  { id: 'nullable-forbid-complement', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$actor.enabled': true } }, { effect: 'forbid', permissions: ['read'], when: { '$resource.rank': { eq: 3 } } }] }, ids: ['d01', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
  { id: 'nullable-ne-is-not-complement', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.rank': { neq: 3 } } }] }, ids: ['d01', 'd04', 'd06', 'd07', 'd08'] },
  { id: 'known-null-exists-false', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.title': { exists: false } } }] }, ids: ['d04'] },
  { id: 'related-public-role', definition: { derived_roles: [{ role: 'viewer', from_role: 'member', on_relation: 'project' }], grants: { viewer: ['read'] } }, ids: ['d01', 'd02', 'd05', 'd08'] },
  { id: 'one-relation-identity', definition: { derived_roles: [{ role: 'owner', from_relation: 'owner' }], grants: { owner: ['read'] } }, ids: ['d01', 'd02', 'd06', 'd08'] },
  { id: 'many-same-row-role', definition: { derived_roles: [{ role: 'viewer', from_role: 'approved', on_relation: 'reviewers' }], grants: { viewer: ['read'] } }, ids: ['d01', 'd05'] },
  { id: 'many-independent-leaf-conditions', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.reviewers.userId': 'u1', '$resource.reviewers.approved': true } }] }, ids: ['d01', 'd02', 'd05'] },
  { id: 'unrestricted', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$actor.enabled': true } }] }, ids: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'] },
  { id: 'forbidden', definition: { rules: [] }, ids: [] },
  { id: 'binary-prefix', definition: { derived_roles: [{ role: 'viewer', when: { '$resource.title': { startsWith: 'Alpha' } } }], grants: { viewer: ['read'] } }, ids: ['d01', 'd02', 'd05'] },
  { id: 'binary-suffix', definition: { derived_roles: [{ role: 'viewer', when: { '$resource.title': { endsWith: 'Alpha' } } }], grants: { viewer: ['read'] } }, ids: ['d03', 'd08'] },
  { id: 'binary-substring', definition: { derived_roles: [{ role: 'viewer', when: { '$resource.title': { contains: 'Alpha' } } }], grants: { viewer: ['read'] } }, ids: ['d01', 'd02', 'd03', 'd05', 'd07', 'd08'] },
  { id: 'missing-env-permit', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.tenant': '$env.tenant' } }] }, ids: [] },
  { id: 'missing-env-forbid', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$actor.enabled': true } }, { effect: 'forbid', permissions: ['read'], when: { '$resource.tenant': { eq: '$env.tenant' } } }] }, ids: [] },
  { id: 'literal-percent', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.title': { contains: '%' } } }] }, ids: ['d05'], prismaUnsupported: true },
  { id: 'literal-underscore', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.title': { contains: '_' } } }] }, ids: ['d05'], prismaUnsupported: true },
  { id: 'literal-backslash', definition: { rules: [{ effect: 'permit', permissions: ['read'], when: { '$resource.title': { contains: '\\' } } }] }, ids: ['d05'], prismaUnsupported: true },
];
