# Toride

[![npm version](https://img.shields.io/npm/v/toride.svg)](https://www.npmjs.com/package/toride)
[![license](https://img.shields.io/npm/l/toride.svg)](https://github.com/toride-auth/toride/blob/main/LICENSE)
[![CI](https://github.com/toride-auth/toride/actions/workflows/ci.yml/badge.svg)](https://github.com/toride-auth/toride/actions/workflows/ci.yml)

Relation-aware authorization engine for TypeScript — define policies in YAML, resolve roles through relations, and check permissions with a single `can()` call.

## Packages

| Package | Description |
|---------|-------------|
| [`toride`](https://www.npmjs.com/package/toride) | Core authorization engine — policies, role resolution, and permission checks |
| [`@toride/codegen`](https://www.npmjs.com/package/@toride/codegen) | Code generation tools — TypeScript types from policy files |
| [`@toride/drizzle`](https://www.npmjs.com/package/@toride/drizzle) | Drizzle ORM integration — translate constraints into Drizzle WHERE clauses |
| [`@toride/prisma`](https://www.npmjs.com/package/@toride/prisma) | Prisma integration — translate constraints into Prisma WHERE clauses |

## Documentation

For installation, quickstart, concepts, and integration guides, visit the official documentation:

**[toride-auth.github.io/toride](https://toride-auth.github.io/toride/)**

## License

[MIT](./LICENSE)
