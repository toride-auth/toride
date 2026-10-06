---
description: YAML ポリシーの定義、リゾルバーの作成、can() による権限チェック、バッチ処理、permittedActions()、explain() を順に試します。
---

# クイックスタート {#quickstart}

このガイドでは、ポリシーの定義から権限チェックの実行まで、Toride を使った最初の認可処理を約 5 分で試します。

## 1. Toride のインストール {#_1-install-toride}

```bash
pnpm add toride
```

## 2. ポリシーの定義 {#_2-define-a-policy}

プロジェクトのルートに `policy.yaml` を作成します。このポリシーでは、3 つのロールとその権限を持つ `Project` リソース、および親プロジェクトからロールを継承する `Task` リソースを定義します。

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      id: string
      email: string
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
    permissions: [read, update, delete, create_task]

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin

      - role: editor
        actor_type: User
        when:
          $actor.department: $resource.department

  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: Project
      assignee: User

    grants:
      viewer: [read]
      editor: [read, update, delete]

    derived_roles:
      - role: editor
        from_role: editor
        on_relation: project

      - role: viewer
        from_role: viewer
        on_relation: project

      - role: editor
        from_relation: assignee

    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          resource.project.status: completed
```

主なポイントは次のとおりです。

- **アクター**は、操作を行う主体とその属性を定義します。
- **グローバルロール**は、アクターの属性から導出されます。たとえば `isSuperAdmin` が true の場合に `superadmin` になります。
- **リソース**は、操作対象と、そのロール、権限、権限付与を定義します。
- **派生ロール**は、関係を通じてロールを伝播させます。たとえばプロジェクトの `editor` はタスクでも `editor` になります。
- **ルール**は、権限付与を上書きできる条件を追加します。たとえば完了済みプロジェクトの編集を禁止できます。

## 3. リゾルバーを使ったエンジンの作成 {#_3-create-the-engine-with-resolvers}

ポリシーとリゾルバーを組み合わせてエンジンを作成します。リゾルバーは、リソースのインスタンスの属性を返す関数です。関係先への参照も `{ type, id }` オブジェクトとして返します。`src/auth/engine.ts` を作成してください。

```typescript
import { Toride, loadYaml } from "toride";
import { readFileSync } from "node:fs";

// In-memory data — no database needed
const projects: Record<string, any> = {
  "proj-1": { status: "active", department: "engineering" },
};

const tasks: Record<string, any> = {
  "task-42": {
    projectId: "proj-1",
    assigneeId: "alice",
    status: "open",
  },
};

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = projects[ref.id];
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});

export { engine };
```

各リゾルバーはリソースのインスタンスの属性を返します。関係フィールドには `ResourceRef` オブジェクト（`{ type, id }`）を入れ、エンジンが関係をたどる際に使用します。この例では通常のオブジェクトを使っていますが、REST API、GraphQL エンドポイント、ファイルシステム、データベースなど、任意の取得元を利用できます。

## 4. 最初の権限チェック {#_4-run-your-first-permission-check}

これで、アプリケーションの任意の場所から権限を確認できます。

```typescript
import { engine } from "./auth/engine";

// Define the actor (the user making the request)
const actor = {
  type: "User",
  id: "alice",
  attributes: {
    email: "alice@example.com",
    department: "engineering",
    isSuperAdmin: false,
  },
};

// Check if alice can update task 42
const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "42",
});

console.log(allowed); // true or false
```

エンジンは次の手順で判定します。

1. Task 42 のすべての `derived_roles` を評価します。例として、project の `from_role` や assignee の `from_relation` があります。
2. 関係に基づく導出では、`Task` リゾルバーで Task の属性を解決します。
3. 関係先のリソース（Project、User）をたどり、再帰的にロールを確認します。
4. すべての派生ロールを重複のない集合にまとめます。
5. ロールの集合に対する権限付与を展開します。
6. 完了済みプロジェクトに対する `forbid` などのルールを評価します。
7. 最終的な判定を返します。

## 5. 実運用でのデータベースリゾルバー {#_5-real-world-database-resolvers}

本番環境では、リゾルバーからデータベースへ問い合わせるのが一般的です。取得元が変わっても、リゾルバーのインターフェースは同じです。

```typescript
import { Toride, loadYaml } from "toride";
import { readFileSync } from "node:fs";

// When your data source is a database, resolvers look like this:
const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Task: async (ref) => {
      const task = await db.task.findById(ref.id);
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = await db.project.findById(ref.id);
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});
```

ポリシーから型安全なリゾルバーの型を生成する方法は [コード生成](/ja/integrations/codegen) を参照してください。ORM を使ってクエリ段階で絞り込む方法は、[Prisma](/ja/integrations/prisma) または [Drizzle](/ja/integrations/drizzle) の連携ガイドで説明しています。

## 6. その他の機能 {#_6-explore-more-features}

基本的な権限チェックが動いたら、次の機能も試してみましょう。

### バッチチェック {#batch-checks}

キャッシュを共有しながら、1 回の呼び出しで複数の権限を確認できます。

```typescript
const results = await engine.canBatch(actor, [
  { action: "read", resource: { type: "Task", id: "1" } },
  { action: "update", resource: { type: "Task", id: "2" } },
  { action: "delete", resource: { type: "Task", id: "3" } },
]);
// results: [true, true, false]
```

### 許可された操作の一覧 {#list-permitted-actions}

アクターがリソースに対して実行できる操作を取得します。

```typescript
const actions = await engine.permittedActions(actor, {
  type: "Task",
  id: "42",
});
// ["read", "update", "delete"]
```

### explain によるデバッグ {#debug-with-explain}

権限チェックがその結果になった理由を確認できます。

```typescript
const decision = await engine.explain(actor, "delete", {
  type: "Task",
  id: "42",
});
console.log(decision);
// {
//   allowed: true,
//   resolvedRoles: {
//     direct: [],
//     derived: [{ role: "editor", via: "from_role editor on_relation project" }]
//   },
//   grantedPermissions: ["read", "update", "delete"],
//   matchedRules: [],
//   finalDecision: "ALLOWED: editor grants delete"
// }
```

## 次に読むページ {#what-s-next}

- [ポリシー形式](/ja/concepts/policy-format) で、より高度なポリシーの書き方を学びます。
- [ロールと関係](/ja/concepts/roles-and-relations) で、複雑なロールの導出を理解します。
- [部分評価](/ja/concepts/partial-evaluation) で、データを絞り込む方法を学びます。
- [Prisma](/ja/integrations/prisma) または [Drizzle](/ja/integrations/drizzle) と連携し、クエリ段階で絞り込みます。
