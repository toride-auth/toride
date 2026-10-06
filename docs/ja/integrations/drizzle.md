---
description: createDrizzleAdapter() の関係・ロール割り当て設定、createDrizzleResolver() の ID 列指定、_op フィールドを持つ中間クエリ記述形式を説明します。
---

# Drizzle 連携 {#drizzle-integration}

`@toride/drizzle` は、[Drizzle ORM](https://orm.drizzle.team/) 向けの制約アダプターとリゾルバーヘルパーを提供します。Toride の制約 AST を、Drizzle のクエリビルダーで利用できる中間クエリ記述オブジェクトに変換します。

## インストール {#installation}

::: code-group

```bash [pnpm]
pnpm add @toride/drizzle toride
```

```bash [npm]
npm install @toride/drizzle toride
```

```bash [yarn]
yarn add @toride/drizzle toride
```

:::

`drizzle-orm` は任意の peer dependency です（>= 0.29.0）。アダプターは操作を記述する中間オブジェクトを生成し、`drizzle-orm` を直接インポートしません。そのため、ビルド時に Drizzle がインストールされていなくても動作します。

## クイックスタート {#quick-start}

### 1. アダプターの作成 {#_1-create-the-adapter}

特定の Drizzle テーブル参照に対してアダプターを作成します。

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { projects } from "./schema";

const adapter = createDrizzleAdapter(projects);
```

### 2. 制約の構築とクエリ {#_2-build-constraints-and-query}

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";
import { createDrizzleAdapter } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, not } from "drizzle-orm";
import { projects } from "./schema";

const db = drizzle(pool);

const policy = await loadYaml(readFileSync("./policy.yaml", "utf-8"));

const engine = new Toride({
  policy,
  resolvers: {
    Project: async (ref) => {
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, ref.id));
      return rows[0] ?? {};
    },
  },
});

const adapter = createDrizzleAdapter(projects);

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

const result = await engine.buildConstraints(actor, "read", "Project");

if (!result.ok) {
  return [];
}

if (result.constraint === null) {
  return await db.select().from(projects);
}

// Translate constraints into a Drizzle query description
const where = engine.translateConstraints(result.constraint, adapter);
// Use the where description with your Drizzle query builder
```

## アダプターの出力形式 {#adapter-output-format}

Prisma アダプターは Prisma が直接扱えるオブジェクトを生成します。一方、Drizzle アダプターは、操作を示す `_op` フィールドを持つ**中間クエリ記述オブジェクト**を生成します。Drizzle のクエリへどう適用するかは、利用側で制御できます。

変換後の各制約は、次の形式になります。

```typescript
{
  _op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "inArray" | "notInArray"
       | "isNull" | "isNotNull" | "arrayContains" | "like"
       | "and" | "or" | "not" | "relation" | "hasRole" | "literal",
  field?: string,
  value?: unknown,
  table?: AnyTable,
  // ... additional properties depending on the operation
}
```

### 制約変換リファレンス {#constraint-translation-reference}

| 制約型 | `_op` の値 | 対応する Drizzle の式 |
|----------------|-------------|-------------------|
| `field_eq` | `"eq"` | `eq(table.field, value)` |
| `field_neq` | `"ne"` | `ne(table.field, value)` |
| `field_gt` | `"gt"` | `gt(table.field, value)` |
| `field_gte` | `"gte"` | `gte(table.field, value)` |
| `field_lt` | `"lt"` | `lt(table.field, value)` |
| `field_lte` | `"lte"` | `lte(table.field, value)` |
| `field_in` | `"inArray"` | `inArray(table.field, values)` |
| `field_nin` | `"notInArray"` | `notInArray(table.field, values)` |
| `field_exists` (true) | `"isNotNull"` | `isNotNull(table.field)` |
| `field_exists` (false) | `"isNull"` | `isNull(table.field)` |
| `field_includes` | `"arrayContains"` | `arrayContains(table.field, value)` |
| `field_contains` | `"like"` | `like(table.field, pattern)` |

複合ノードは `"and"`、`"or"`、`"not"` と、`children` または `child` プロパティを使用します。

## アダプターのオプション {#adapter-options}

### 関係の設定 {#relation-configuration}

制約内の関係フィールドを、Drizzle のテーブル参照と外部キーに対応付けます。

```typescript
import { projects, organizations } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: {
      table: organizations,
      foreignKey: "orgId",
    },
  },
});
```

制約 AST に `org` フィールドの `relation` ノードがあると、アダプターは関係先のテーブル参照と外部キーを出力に含めます。

```typescript
{
  _op: "relation",
  field: "org",
  resourceType: "Organization",
  child: { /* nested constraint */ },
  relatedTable: organizations,
  foreignKey: "orgId",
}
```

### ロール割り当ての設定 {#role-assignment-configuration}

`hasRole` 制約の生成方法を設定します。

```typescript
import { memberships } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  roleAssignments: {
    table: memberships,
    userIdColumn: "memberId",
    roleColumn: "memberRole",
  },
});
```

次の出力が生成されます。

```typescript
{
  _op: "hasRole",
  actorId: "user-123",
  actorType: "User",
  role: "editor",
  roleTable: memberships,
  userIdColumn: "memberId",
  roleColumn: "memberRole",
}
```

## Drizzle によるリゾルバーの作成 {#creating-resolvers-with-drizzle}

`createDrizzleResolver()` は、Drizzle の `select` クエリを、Toride が要求するリゾルバーのシグネチャに合わせるヘルパーです。

```typescript
import { readFileSync } from "node:fs";
import { createDrizzleResolver } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { projects, tasks } from "./schema";

const db = drizzle(pool);

const policy = await loadYaml(readFileSync("./policy.yaml", "utf-8"));

const engine = new Toride({
  policy,
  resolvers: {
    Project: createDrizzleResolver(db, projects),
    Task: createDrizzleResolver(db, tasks),
  },
});
```

リゾルバーは `db.select().from(table).where({ id: ref.id })` を呼び出し、最初の行を返します。行が見つからない場合は、空のオブジェクト `{}` を返します。

### ID 列のカスタマイズ {#custom-id-column}

主キーが `id` 以外の列である場合は、次のように指定します。

```typescript
const resolver = createDrizzleResolver(db, projects, {
  idColumn: "uuid",
});
```

## 完全な例 {#complete-example}

ポリシー、Drizzle スキーマ、エンジンの設定、認可済みデータの取得を組み合わせた一連の例です。

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      department: string

resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete]

    relations:
      org: Organization

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    derived_roles:
      - role: viewer
        when:
          $resource.isPublic: true
      - role: viewer
        actor_type: User
        when:
          $actor.department: $resource.department

    rules:
      - effect: forbid
        permissions: [read, update, delete]
        when:
          $resource.archived: true
```

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";
import { createDrizzleAdapter, createDrizzleResolver } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { projects, organizations } from "./schema";

const db = drizzle(pool);

const policy = await loadYaml(readFileSync("./policy.yaml", "utf-8"));

const engine = new Toride({
  policy,
  resolvers: {
    Project: createDrizzleResolver(db, projects),
  },
});

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: { table: organizations, foreignKey: "orgId" },
  },
});

async function listProjects(actor: {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
}) {
  const result = await engine.buildConstraints(actor, "read", "Project");

  if (!result.ok) {
    return [];
  }

  if (result.constraint === null) {
    return await db.select().from(projects);
  }

  const where = engine.translateConstraints(result.constraint, adapter);
  // Process the `where` description object with your Drizzle query builder
  return where;
}

const alice = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};
const aliceProjects = await listProjects(alice);
```

## 次に読むページ {#what-s-next}

- [部分評価](/ja/concepts/partial-evaluation)：`buildConstraints()` と制約 AST の仕組みを理解します。
- [条件とルール](/ja/concepts/conditions-and-rules)：制約生成の元になる条件式を学びます。
- [ロールと関係](/ja/concepts/roles-and-relations)：ロールの導出が制約の出力に与える影響を確認します。
- [Prisma 連携](/ja/integrations/prisma)：Prisma ORM 向けのアダプターです。
- [コード生成](/ja/integrations/codegen)：ポリシーファイルから TypeScript 型を生成します。
