---
description: createPrismaAdapter() の関係マッピングとロール割り当て設定、createPrismaResolver() の select オプション、制約から Prisma の WHERE 句への変換を説明します。
---

# Prisma 連携 {#prisma-integration}

`@toride/prisma` は、[Prisma ORM](https://www.prisma.io/) 向けの制約アダプターとリゾルバーヘルパーを提供します。Toride の制約 AST を Prisma の `where` 句オブジェクトへ変換し、データベースに認可条件を組み込めます。

## インストール {#installation}

::: code-group

```bash [pnpm]
pnpm add @toride/prisma toride
```

```bash [npm]
npm install @toride/prisma toride
```

```bash [yarn]
yarn add @toride/prisma toride
```

:::

`@toride/prisma` は `@prisma/client` に直接依存しません。Prisma の WHERE 句の構造に合う通常の JavaScript オブジェクトを生成するため、Prisma のバージョンに依存せずに利用できます。

## クイックスタート {#quick-start}

### 1. アダプターの作成 {#_1-create-the-adapter}

```typescript
import { createPrismaAdapter } from "@toride/prisma";

const adapter = createPrismaAdapter();
```

### 2. 制約の構築とクエリ {#_2-build-constraints-and-query}

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Project: async (ref) => {
      const project = await prisma.project.findUnique({
        where: { id: ref.id },
      });
      return project ?? {};
    },
  },
});

const adapter = createPrismaAdapter();

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

const result = await engine.buildConstraints(actor, "read", "Project");

if (!result.ok) {
  // Actor has no access at all
  return [];
}

if (result.constraint === null) {
  // Actor can see everything
  return await prisma.project.findMany();
}

// Translate constraints into a Prisma WHERE clause
const where = engine.translateConstraints(result.constraint, adapter);
const projects = await prisma.project.findMany({ where });
```

`where` は、Prisma がそのまま解釈できる通常の JavaScript オブジェクトです。たとえば「status が active かつ archived が false」という制約は、次のようになります。

```typescript
{
  AND: [
    { status: "active" },
    { NOT: { archived: true } }
  ]
}
```

## アダプターのオプション {#adapter-options}

### 関係のマッピング {#relation-mapping}

制約のフィールド名と Prisma の関係名が異なる場合は、`relationMapping` を指定します。

```typescript
const adapter = createPrismaAdapter({
  relationMapping: {
    org: "organization", // constraint field "org" → Prisma relation "organization"
    project: "project",  // same name — optional, but explicit
  },
});
```

制約 AST に `org` フィールドの `relation` ノードがあると、アダプターは `{ org: childQuery }` の代わりに `{ organization: childQuery }` を生成します。

### ロール割り当てテーブルのカスタマイズ {#custom-role-assignment-table}

デフォルトでは、`userId` と `role` フィールドを持つ `roleAssignments` テーブルを使って `hasRole` 制約を生成します。次のように変更できます。

```typescript
const adapter = createPrismaAdapter({
  roleAssignmentTable: "memberships",
  roleAssignmentFields: {
    userId: "memberId",
    role: "memberRole",
  },
});
```

次のような WHERE 句が生成されます。

```typescript
{
  memberships: {
    some: {
      memberId: "user-123",
      memberRole: "editor",
    },
  },
}
```

## 制約変換リファレンス {#constraint-translation-reference}

各制約型は、対応する Prisma の WHERE 構文へ変換されます。

| 制約型 | Prisma の出力 |
|----------------|---------------|
| `field_eq` | `{ field: value }` |
| `field_neq` | `{ field: { not: value } }` |
| `field_gt` | `{ field: { gt: value } }` |
| `field_gte` | `{ field: { gte: value } }` |
| `field_lt` | `{ field: { lt: value } }` |
| `field_lte` | `{ field: { lte: value } }` |
| `field_in` | `{ field: { in: values } }` |
| `field_nin` | `{ field: { notIn: values } }` |
| `field_exists` (true) | `{ field: { not: null } }` |
| `field_exists` (false) | `{ field: null }` |
| `field_includes` | `{ field: { has: value } }` |
| `field_contains` | `{ field: { contains: value } }` |

複合ノードの `and`、`or`、`not` は、Prisma の `AND`、`OR`、`NOT` 演算子に対応します。

## Prisma によるリゾルバーの作成 {#creating-resolvers-with-prisma}

`createPrismaResolver()` は、Prisma の `findUnique` 呼び出しを、Toride が要求するリゾルバーのシグネチャに合わせるヘルパーです。

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";
import { createPrismaResolver } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Project: createPrismaResolver(prisma, "project"),
    Task: createPrismaResolver(prisma, "task"),
    Document: createPrismaResolver(prisma, "document", {
      select: { id: true, title: true, ownerId: true, status: true },
    }),
  },
});
```

リゾルバーは `prisma[modelName].findUnique({ where: { id: ref.id } })` を呼び出し、結果を通常のオブジェクトとして返します。レコードが見つからない場合は、空のオブジェクト `{}` を返します。

### select オプション {#select-option}

`select` で取得するフィールドを限定できます。モデルに多数の列があり、認可判断には一部だけが必要な場合に、パフォーマンスの改善に役立ちます。

```typescript
const resolver = createPrismaResolver(prisma, "project", {
  select: { id: true, ownerId: true, department: true, isPublic: true },
});
```

## 完全な例 {#complete-example}

ポリシー、Prisma スキーマ、エンジンの設定、認可済みデータの取得を組み合わせた一連の例です。

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      department: string
      isSuperAdmin: boolean

global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

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
      - role: admin
        from_global_role: superadmin
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
import { createPrismaAdapter, createPrismaResolver } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Project: createPrismaResolver(prisma, "project"),
  },
});

const adapter = createPrismaAdapter({
  relationMapping: {
    org: "organization",
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
    return await prisma.project.findMany();
  }

  const where = engine.translateConstraints(result.constraint, adapter);
  return await prisma.project.findMany({ where });
}

// A regular user sees projects in their department + public projects (minus archived)
const alice = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering", isSuperAdmin: false },
};
const aliceProjects = await listProjects(alice);

// A superadmin sees all non-archived projects
const admin = {
  type: "User",
  id: "admin",
  attributes: { department: "ops", isSuperAdmin: true },
};
const adminProjects = await listProjects(admin);
```

## 次に読むページ {#what-s-next}

- [部分評価](/ja/concepts/partial-evaluation)：`buildConstraints()` と制約 AST の仕組みを理解します。
- [条件とルール](/ja/concepts/conditions-and-rules)：制約生成の元になる条件式を学びます。
- [ロールと関係](/ja/concepts/roles-and-relations)：ロールの導出が制約の出力に与える影響を確認します。
- [Drizzle 連携](/ja/integrations/drizzle)：Drizzle ORM 向けのアダプターです。
- [コード生成](/ja/integrations/codegen)：ポリシーファイルから TypeScript 型を生成します。
