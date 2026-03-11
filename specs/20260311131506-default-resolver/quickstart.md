# Quickstart: Default Resolver Formalization

## What this feature does

Formalizes that toride works without any resolvers — if you pass inline attributes on `ResourceRef`, the engine uses them directly. No resolver registration needed.

## Verify existing behavior (no code changes needed)

```typescript
import { createToride } from 'toride';

const policy = {
  version: '1' as const,
  actors: { User: { attributes: { role: 'string' } } },
  resources: {
    Document: {
      roles: ['viewer'],
      permissions: ['read'],
      grants: { viewer: ['read'] },
      rules: [{
        effect: 'permit' as const,
        permissions: ['read'],
        when: { '$resource.status': 'published' },
      }],
    },
  },
};

// No resolvers — inline attributes are the default data source
const engine = createToride({ policy });

const allowed = await engine.can(
  { type: 'User', id: 'u1', attributes: { role: 'reader' } },
  'read',
  { type: 'Document', id: 'doc1', attributes: { status: 'published' } },
);

console.log(allowed); // true — resolved from inline attributes
```

## Run the new tests

```bash
pnpm exec nx run toride:test -- --grep "default resolver"
```

## Build the docs locally

```bash
cd docs && pnpm run dev
# Navigate to Concepts > Resolvers
```
