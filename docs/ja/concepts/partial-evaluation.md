---
description: buildConstraints()、制約 AST のノード型、ConstraintAdapter、translateConstraints()、ORM アダプターによるクエリ段階の絞り込みを説明します。
---

# 部分評価 {#partial-evaluation}

部分評価は、認可ルールをクエリの制約に変換する仕組みです。全レコードを読み込んで 1 件ずつ権限を確認する代わりに、**データ層に認可条件を組み込めます**。データソースがデータベースの場合は、クエリ段階で絞り込む WHERE 句を生成します。これにより「自分が閲覧できるプロジェクトをすべて取得する」といったクエリを効率的に処理できます。

## 課題 {#the-problem}

一覧の認可を単純に実装すると、すべてのレコードを読み込み、アプリケーションのコードで絞り込むことになります。

```typescript
// Slow: loads every project, then checks each one
const allProjects = await db.project.findMany();
const visible = [];
for (const project of allProjects) {
  if (await engine.can(actor, "read", { type: "Project", id: project.id })) {
    visible.push(project);
  }
}
```

この方式は件数が増えると非効率です。プロジェクトが 10,000 件あれば、権限チェックも 10,000 回必要です。

## 解決策：`buildConstraints()` {#the-solution-buildconstraints}

`buildConstraints()` は特定のリソースインスタンスを指定せず、アクターのロールとルールを**部分的に**評価します。アクセス可能なリソースの条件を表す**制約 AST**を生成し、それをデータベースの WHERE 句へ変換します。

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");
```

結果は次の 3 通りです。

| 結果 | 意味 | 処理 |
|--------|---------|--------|
| `{ ok: true, constraint: null }` | この型の**すべての**リソースにアクセス可能 | WHERE 句は不要 |
| `{ ok: false }` | この型の**どの**リソースにもアクセス不可 | 空の結果を返す |
| `{ ok: true, constraint: Constraint }` | 制約に一致するリソースにアクセス可能 | WHERE 句に変換 |

### 結果の処理 {#handling-the-result}

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");

if (!result.ok) {
  // Actor has no access at all
  return [];
}

if (result.constraint === null) {
  // Actor can see everything
  return await db.project.findMany();
}

// Translate constraints to a database query
const where = engine.translateConstraints(result.constraint, adapter);
return await db.project.findMany({ where });
```

## 制約 AST {#the-constraint-ast}

結果の `constraint` が null でない場合、その値は制約ノードのツリーです。各ノードが、リソースの満たすべき条件を表します。

### 葉ノード {#leaf-nodes}

| 型 | 説明 | 例 |
|------|-------------|---------|
| `field_eq` | フィールドが値と等しい | `{ type: "field_eq", field: "status", value: "active" }` |
| `field_neq` | フィールドが値と等しくない | `{ type: "field_neq", field: "status", value: "archived" }` |
| `field_gt` | より大きい | `{ type: "field_gt", field: "priority", value: 3 }` |
| `field_gte` | 以上 | `{ type: "field_gte", field: "priority", value: 3 }` |
| `field_lt` | より小さい | `{ type: "field_lt", field: "count", value: 100 }` |
| `field_lte` | 以下 | `{ type: "field_lte", field: "count", value: 100 }` |
| `field_in` | 値が配列に含まれる | `{ type: "field_in", field: "status", values: ["active", "review"] }` |
| `field_exists` | フィールドが存在する | `{ type: "field_exists", field: "assigneeId", exists: true }` |
| `field_includes` | 配列が値を含む | `{ type: "field_includes", field: "tags", value: "featured" }` |
| `field_contains` | 文字列が部分文字列を含む | `{ type: "field_contains", field: "name", value: "draft" }` |

### 複合ノード {#composite-nodes}

| 型 | 説明 |
|------|-------------|
| `and` | すべての子が true |
| `or` | 少なくとも 1 つの子が true |
| `not` | 子が false |
| `relation` | 関連リソースに対する制約 |
| `has_role` | アクターがリソース上のロールを持つ（ロール割り当てとの結合が必要） |
| `always` | 常に true（この経路ではアクセス制限なし） |
| `never` | 常に false（この経路ではアクセス不可） |

### 制約の構築方法 {#how-constraints-are-built}

指定されたアクター、操作、リソース型について、エンジンはすべての導出経路を調べます。

1. アクターが持ち得るロールを評価します。既知のアクター属性や環境値は実際の値に置き換えます。
2. そのうち、要求された操作を付与するロールを確認します。
3. 権限を付与する各経路から、その条件を表す制約を生成します。
4. すべての経路を OR で結合します。いずれかの経路で許可されれば十分です。
5. forbid ルールを NOT 制約として適用します。
6. 冗長なノードの除去や、子が 1 つの AND/OR の簡約を行います。

アクター属性と環境値は、部分評価時に**実際の値に置き換えられます**。たとえば派生ロールが `$actor.department: "engineering"` を要求し、アクターの department が `"engineering"` なら、その条件は `true` に解決され、出力の制約には残りません。AST に残るのは `$resource` の条件だけです。

## 制約アダプター {#constraint-adapters}

**制約アダプター**は、制約 AST をデータストアのクエリ形式に変換します。Prisma と Drizzle 向けのアダプターが用意されており、独自実装も可能です。

### アダプターのインターフェース {#the-adapter-interface}

```typescript
interface ConstraintAdapter<TQueryMap extends Record<string, unknown>> {
  translate(constraint: LeafConstraint): TQueryMap[string];
  relation(field: string, resourceType: string, childQuery: TQueryMap[string]): TQueryMap[string];
  hasRole(actorId: string, actorType: string, role: string): TQueryMap[string];
  unknown(name: string): TQueryMap[string];
  and(queries: TQueryMap[string][]): TQueryMap[string];
  or(queries: TQueryMap[string][]): TQueryMap[string];
  not(query: TQueryMap[string]): TQueryMap[string];
}
```

| メソッド | 対象 | 役割 |
|--------|-----------|---------|
| `translate` | 葉の制約ノード | フィールド比較をクエリ構文に変換 |
| `relation` | 関係の制約 | 関連リソースへの結合や入れ子のクエリを構築 |
| `hasRole` | has_role 制約 | ロール割り当てテーブルへのサブクエリを構築 |
| `unknown` | 不明な制約ノード | 変換できないカスタム評価関数を処理 |
| `and` | AND ノード | クエリを AND で結合 |
| `or` | OR ノード | クエリを OR で結合 |
| `not` | NOT ノード | クエリを否定 |

### `translateConstraints()` の使用 {#using-translateconstraints}

アダプターを用意したら、`translateConstraints()` に渡します。

```typescript
import { createPrismaAdapter } from "@toride/prisma";

const adapter = createPrismaAdapter();

const result = await engine.buildConstraints(actor, "read", "Project");

if (result.ok && result.constraint !== null) {
  const where = engine.translateConstraints(result.constraint, adapter);
  const projects = await prisma.project.findMany({ where });
}
```

### Prisma での使用 {#using-with-prisma}

`@toride/prisma` パッケージには、そのまま使えるアダプターが用意されています。

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: { /* ... */ },
});

const adapter = createPrismaAdapter({
  relationMapping: {
    project: "project",        // Maps constraint field to Prisma relation
    org: "organization",       // Rename if Prisma relation differs
  },
});

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
  return await prisma.project.findMany();
}

const where = engine.translateConstraints(result.constraint, adapter);
const projects = await prisma.project.findMany({ where });
// Prisma generates SQL with the authorization constraints baked in
```

詳細は [Prisma 連携ガイド](/ja/integrations/prisma)を参照してください。

### Drizzle での使用 {#using-with-drizzle}

`@toride/drizzle` パッケージには、Drizzle ORM 向けのアダプターが用意されています。

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { projects } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: { table: organizations, foreignKey: "orgId" },
  },
});

const result = await engine.buildConstraints(actor, "read", "Project");

if (result.ok && result.constraint !== null) {
  const where = engine.translateConstraints(result.constraint, adapter);
  // Use the where clause with Drizzle's query builder
}
```

詳細は [Drizzle 連携ガイド](/ja/integrations/drizzle)を参照してください。

### 独自アダプターの実装 {#writing-a-custom-adapter}

他のデータベースや ORM に対応するには、`ConstraintAdapter` インターフェースを実装します。

```typescript
import type { ConstraintAdapter, LeafConstraint } from "toride";

type MongoQuery = Record<string, unknown>;
type MongoQueryMap = Record<string, MongoQuery>;

const mongoAdapter: ConstraintAdapter<MongoQueryMap> = {
  translate(constraint: LeafConstraint): MongoQuery {
    switch (constraint.type) {
      case "field_eq":
        return { [constraint.field]: constraint.value };
      case "field_neq":
        return { [constraint.field]: { $ne: constraint.value } };
      case "field_gt":
        return { [constraint.field]: { $gt: constraint.value } };
      case "field_in":
        return { [constraint.field]: { $in: constraint.values } };
      // ... handle other constraint types
      default:
        return {};
    }
  },

  relation(field, _resourceType, childQuery) {
    // MongoDB uses dot notation for nested documents
    return Object.fromEntries(
      Object.entries(childQuery).map(([k, v]) => [`${field}.${k}`, v]),
    );
  },

  hasRole(actorId, _actorType, role) {
    return {
      roleAssignments: {
        $elemMatch: { userId: actorId, role },
      },
    };
  },

  unknown(_name) {
    return {}; // Ignore unknown constraints
  },

  and(queries) {
    return { $and: queries };
  },

  or(queries) {
    return { $or: queries };
  },

  not(query) {
    return { $not: query };
  },
};
```

## 環境コンテキスト {#environment-context}

`can()` と同様に、`buildConstraints()` に環境値を渡せます。

```typescript
const result = await engine.buildConstraints(actor, "read", "Project", {
  env: { currentTime: Date.now() },
});
```

部分評価時に環境値は実際の値に置き換えられます。そのため、出力される制約の `$env.currentTime` は具体的な値になります。

## 完全な例 {#complete-example}

ポリシー、エンジンの設定、データの絞り込みを組み合わせた一連の例です。

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
import { createPrismaAdapter } from "@toride/prisma";

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

async function listProjects(actor) {
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

- [条件とルール](/ja/concepts/conditions-and-rules)：制約の元になる条件式を理解します。
- [ロールと関係](/ja/concepts/roles-and-relations)：導出パターンから制約の経路が生成される仕組みを学びます。
- [クライアント側の権限ヒント](/ja/concepts/client-side-hints)：権限スナップショットをフロントエンドに渡します。
- [Prisma 連携](/ja/integrations/prisma)：Prisma アダプターの詳細です。
- [Drizzle 連携](/ja/integrations/drizzle)：Drizzle アダプターの詳細です。
