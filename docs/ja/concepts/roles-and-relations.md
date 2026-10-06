---
description: グローバルロール、関連リソース上のロール、関係先との同一性、アクター型と条件、条件のみという 5 つの導出パターン、および循環検出と深さ制限を説明します。
---

# ロールと関係 {#roles-relations}

Toride は宣言的なロールモデルを採用しています。実行時の検索でロールを直接割り当てるのではなく、すべてのロールをポリシールールから**導出**します。グローバルロール、関連リソース上のロール、関係先との同一性、アクター型と条件、条件のみという 5 つのパターンをすべて YAML で宣言します。アクターがロールを取得する仕組みは、ポリシーファイルに集約されます。このページでは、ロールの動作、リソースを結ぶ関係、各導出パターンを説明します。

## ロールの仕組み {#how-roles-work}

[ポリシー](/ja/concepts/policy-format)の各リソースは、そのリソース上で持つことのできるロールを宣言します。

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]
```

ロールは、**grants** を通じて権限に対応付けられるラベルです。特定の Project インスタンスで `editor` ロールを持つアクターは、その grant に列挙された権限を得ます。

```yaml
    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]
```

`all` は、そのリソースで宣言されているすべての権限へ動的に展開されます。

## 関係 {#relations}

関係はリソース間の型付きのつながりを定義し、階層構造や所有関係を表現します。

```yaml
resources:
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: Project
      assignee: User
      watchers: User
```

各関係の値は、ポリシー内の別のリソースを参照する型名の文字列です。

関係には 2 つの用途があります。

1. **派生ロール**：親リソースから子リソースへロールを伝播させます。
2. **条件**：[ルール](/ja/concepts/conditions-and-rules)から関連リソースの属性を参照します。

### 関係の解決 {#resolving-relations}

実行時、エンジンは**リゾルバー**を通じて関係を解決します。リゾルバーは任意のデータソースから属性を返す通常の関数です。Toride は関係をたどる必要があるときにリゾルバーを呼び出し、関係先のリソース参照を取得します。

```typescript
import { readFileSync } from "node:fs";

// In-memory data — no database required
const tasks = {
  "task-42": {
    projectId: "proj-1",
    assigneeId: "alice",
    watcherIds: ["bob", "carol"],
    status: "active",
  },
};

const projects = {
  "proj-1": { orgId: "org-1", status: "active" },
};

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        watchers: task.watcherIds.map((id) => ({ type: "User", id })),
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = projects[ref.id];
      return {
        org: { type: "Organization", id: project.orgId },
        status: project.status,
      };
    },
  },
});
```

リゾルバーはフラットなオブジェクトを返します。関係フィールドには `type` と `id` を持つ `ResourceRef` オブジェクトを設定し、`many` の関係にはその配列を返します。`status` などの関係以外のフィールドは、[条件](/ja/concepts/conditions-and-rules)で使う通常の属性値です。必要な形式の値を返せれば、インメモリのオブジェクト、REST API、データベースなど、任意のデータソースを使えます。

## 5 つの導出パターン {#the-five-derivation-patterns}

アクターがリソース上のロールを取得する方法は 5 つあります。いずれもリソースブロックの `derived_roles` 配列で宣言します。

### 1. グローバルロールからの導出 {#_1-global-role-derivation}

[グローバルロール](/ja/concepts/policy-format#global-roles)を、リソース内のロールに対応付けます。グローバルロールはアクターの属性だけから導出されます。

```yaml
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

resources:
  Project:
    roles: [viewer, editor, admin]
    # ...
    derived_roles:
      - role: admin
        from_global_role: superadmin
```

**動作**：アクターが `User` で `isSuperAdmin` が `true` なら、グローバルロール `superadmin` に一致します。その後、派生ロールの定義によって `Project` 上の `admin` ロールを付与します。

```typescript
const actor = {
  type: "User",
  id: "alice",
  attributes: { isSuperAdmin: true },
};

// Alice gets admin role on every Project via the superadmin global role
const allowed = await engine.can(actor, "delete", {
  type: "Project",
  id: "proj-1",
});
// true (admin grants "all" permissions)
```

### 2. 関連リソース上のロール {#_2-role-on-a-related-resource}

関連先のポリシーを再帰的に評価して、子のロールを導出します。関係が存在するだけではロールを付与しません。

```yaml
resources:
  Task:
    roles: [viewer, editor]
    # ...
    relations:
      project: Project

    derived_roles:
      - role: editor
        from_role: editor
        on_relation: project
```

**動作**：Toride は Task の `project` 関係をたどって Project に到達し、その Project 上のアクターのロールを解決します。そこで `editor` を持っていれば、Task 上でも `editor` を付与します。

```typescript
// Alice is an editor on Project "proj-1"
// Task "task-42" belongs to Project "proj-1"
const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "task-42",
});
// true (editor on project -> editor on task -> update permission)
```

このパターンは**複数階層の連鎖**に対応しています。Project が Organization から、Task が Project からロールを導出する場合、ロールは次のように伝播します。

```yaml
resources:
  Organization:
    roles: [member, admin]
    # ...

  Project:
    roles: [viewer, editor, admin]
    relations:
      org: Organization
    derived_roles:
      - role: admin
        from_role: admin
        on_relation: org

  Task:
    roles: [viewer, editor]
    relations:
      project: Project
    derived_roles:
      - role: editor
        from_role: admin
        on_relation: project
```

Organization の `admin` は org 関係を通じて Project の `admin` になり、Project の `admin` は project 関係を通じて Task の `editor` になります。

関連ロールは、関連先に宣言された `derived_roles` の条件から解決します。暗黙の `roleAssignments` テーブルは参照しません。ロール割り当てを保存するアプリケーションでは、リゾルバーの属性とポリシー条件でそのデータを表現します。クエリ変換には対応する明示的なマッピングが必要です。

関係の参照は宣言した関係先と一致する必要があります。配列の関係では、必要なロールが 1 つの関連リソース上で成立すれば導出できます。派生ロールの条件全体は、その関連リソースの中で評価します。実行時と部分評価は同じ環境値とカスタム評価の規則を使います。再帰的なロール構造を正確にクエリへ変換できない場合は、エラーになります。

### 3. 関係先との同一性 {#_3-relation-identity}

アクターが関係先の主体**そのもの**である場合にロールを付与します。所有者や担当者を表現する際に使います。

```yaml
resources:
  Task:
    roles: [viewer, editor]
    relations:
      assignee: User
    derived_roles:
      - role: editor
        from_relation: assignee
```

**動作**：Toride は Task の `assignee` 関係を解決します。担当者の `type` と `id` がアクターの `type` と `id` に一致すれば、`editor` ロールを付与します。

```typescript
// Task "task-42" has assignee { type: "User", id: "alice" }
const actor = { type: "User", id: "alice", attributes: {} };

const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "task-42",
});
// true (alice IS the assignee -> editor role -> update permission)
```

`many` の関係でも利用できます。配列のいずれかの要素がアクターに一致すれば、ロールを付与します。

```yaml
    relations:
      watchers: User
    derived_roles:
      - role: viewer
        from_relation: watchers
```

### 4. アクター型と条件 {#_4-actor-type-with-condition}

アクターの型と属性値に基づいてロールを付与します。アクターの性質に基づく広範なアクセスルールに適しています。

```yaml
resources:
  Document:
    roles: [viewer, editor]
    derived_roles:
      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering
```

**動作**：アクター型が `User` で、**かつ** `department` が `engineering` なら、すべての `Document` で `viewer` ロールを取得します。`actor_type` を先に確認し、型が一致しない場合は条件を評価しません。

```typescript
const actor = {
  type: "User",
  id: "bob",
  attributes: { department: "engineering" },
};

const allowed = await engine.can(actor, "read", {
  type: "Document",
  id: "doc-1",
});
// true (User in engineering -> viewer -> read permission)
```

`when` ブロックでは、`$resource` 属性の参照を含む、すべての[条件式の構文](/ja/concepts/conditions-and-rules)を使用できます。

```yaml
    derived_roles:
      - role: editor
        actor_type: User
        when:
          $actor.department: $resource.ownerDepartment
```

### 5. 条件のみ {#_5-condition-only}

アクター型を制限せず、条件だけに基づいてロールを付与します。条件を満たす任意のアクターがロールを取得します。

```yaml
resources:
  Report:
    roles: [viewer]
    derived_roles:
      - role: viewer
        when:
          $resource.isPublic: true
```

**動作**：リソースの `isPublic` 属性が `true` の場合、すべてのアクターが `viewer` ロールを取得します。公開リソースへのアクセスを表す際に便利です。

```typescript
// Report "report-1" has isPublic: true
const allowed = await engine.can(actor, "read", {
  type: "Report",
  id: "report-1",
});
// true (isPublic -> viewer -> read permission)
```

複数の条件を組み合わせることもできます。

```yaml
    derived_roles:
      - role: viewer
        when:
          $resource.visibility: public
          $env.featureFlag: true
```

`when` ブロック内の条件はすべて AND で結合されます。OR を使う場合は、[条件とルール](/ja/concepts/conditions-and-rules#logical-combinators)で説明する `any` を使用してください。

## ロールの解決順序 {#role-resolution-order}

権限チェック時、Toride は次の順序でロールを解決します。

1. リソースのすべての `derived_roles` を評価します。
2. 一致したロールを重複のない集合にまとめます。
3. そのロール集合に対する grants を展開します。
4. 要求された操作が付与された権限に含まれるかを確認します。
5. grants に加えて [ルール](/ja/concepts/conditions-and-rules)（permit/forbid）を評価します。

解決されたロールは、コードから確認できます。

```typescript
const roles = await engine.resolvedRoles(actor, {
  type: "Task",
  id: "task-42",
});
// ["editor", "viewer"]
```

## 循環検出と深さ制限 {#cycle-detection-and-depth-limits}

関係に基づく導出（パターン 2）は、Task → Project → Organization のような連鎖を作れます。Toride は無限ループや過度な深さを防止します。

- **循環検出**：導出の連鎖で `Type:id` が同じリソースを 2 回訪れると、その導出は判定不能になります。
- **深さ制限**：`maxDerivedRoleDepth` で設定できます（デフォルトは 5）。上限を超えると、その導出は判定不能になります。

```typescript
const engine = new Toride({
  policy,
  resolvers,
  maxDerivedRoleDepth: 10, // Allow deeper chains
});
```

どちらのエラーもフェイルクローズで処理されます。導出経路を解決できなければ、そのロールは付与されません。

## 次に読むページ {#what-s-next}

- [ポリシー形式](/ja/concepts/policy-format)：ポリシー全体でのロールの位置付けを確認します。
- [条件とルール](/ja/concepts/conditions-and-rules)：ロールによる権限付与に条件を加えます。
- [部分評価](/ja/concepts/partial-evaluation)：データ層のクエリに認可条件を組み込みます。
