# JSDoc Contract: Default Resolver Documentation

## Target Types and Required Documentation

### 1. `ResourceResolver` (types.ts)

Current JSDoc:
```
Per-type resolver function.
Called when the engine needs attributes not available inline.
Called at most once per unique resource per evaluation (cached).
```

Required additions:
- Explain that registering a resolver is **optional** per resource type
- When no resolver is registered, inline `ResourceRef.attributes` are used as the sole data source (default resolver behavior)
- Resolver is only needed when attributes must be fetched from an external source

### 2. `Resolvers` (types.ts)

Current JSDoc:
```
Map of resource type names to their resolver functions.
Not all types need resolvers — types without resolvers use trivial resolution
(fields are undefined unless provided inline).
```

Required additions:
- Clarify "trivial resolution" as the "default resolver" pattern
- Mention that inline `ResourceRef.attributes` serve as the default data source

### 3. `TorideOptions.resolvers` (types.ts)

Current JSDoc:
```
Per-type resolver map. Optional — engine works without resolvers if all data is inline.
```

Required additions:
- `@example` block showing usage without resolvers (inline-only mode)
- Explain merge precedence: when both inline attributes and a resolver are present, inline wins

### 4. `AttributeCache` class (evaluation/cache.ts)

Current JSDoc:
```
Per-check attribute cache. Created fresh for each can() call.
Stores Promises to prevent duplicate concurrent calls for the same key.
Resolution strategy: [4-point list]
```

Required additions:
- Frame the "no resolver" paths (points 2 and 4) as "default resolver behavior"
- Reference the GraphQL analogy: inline attributes serve the role of GraphQL's `parent` parameter

## Merge Precedence Rule

All JSDoc should consistently state: **inline attributes take precedence over resolver results** (field-by-field merge).
