---
description: actors、global_roles、resources、roles、permissions、grants、relations、derived_roles、rules と、mergePolicies() によるポリシーの合成を説明する YAML リファレンスです。
---

# ポリシー形式 {#policy-format}

Toride のポリシーは YAML（または JSON）で記述し、認可モデル全体の**唯一の定義元**として使います。アクター、アクセス対象のリソース、ロールと権限の対応、許可や拒否の条件を 1 つのファイルで宣言できます。手続き的なコードは不要で、エンジンのすべての認可判断は、このファイルの宣言に基づきます。

## トップレベルの構造 {#top-level-structure}

ポリシーには、トップレベルに次の 4 つの項目があります。

```yaml
version: "1"

actors:
  # Who can perform actions

global_roles:
  # Roles derived from actor attributes (optional)

resources:
  # What can be acted upon
```

| 項目 | 必須 | 説明 |
|---------|----------|-------------|
| `version` | はい | ポリシー形式のバージョン。現在は `"1"`。 |
| `actors` | はい | 属性のスキーマを含むアクター型の宣言。 |
| `global_roles` | いいえ | 特定のリソースに依存せず、アクターの属性だけから導出するロール。 |
| `resources` | はい | ロール、権限、権限付与、関係、ルールを定義するリソースブロック。 |

## アクター {#actors}

`actors` では、システムで操作を行う主体の型を宣言します。各アクター型には、保持する属性とその型を指定します。

```yaml
actors:
  User:
    attributes:
      email: string
      department: string
      isSuperAdmin: boolean

  ServiceAccount:
    attributes:
      service: string
      scope: string
```

属性の型には `string`、`number`、`boolean` を使用できます。この宣言は検証に使われます。[条件やルール](/ja/concepts/conditions-and-rules) が `$actor.department` を参照すると、Toride は読み込み時に、そのアクター型で `department` 属性が宣言されていることを検証します。

認可チェックを行う際は、型を含む参照としてアクターを渡します。

```typescript
const actor = {
  type: "User",
  id: "alice",
  attributes: {
    email: "alice@example.com",
    department: "engineering",
    isSuperAdmin: false,
  },
};
```

## グローバルロール {#global-roles}

グローバルロールは特定のリソースに割り当てるものではなく、アクターの属性から導出します。アクター型が一致し、その属性に対する `when` 条件が成立するかを評価します。

```yaml
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

  service_reader:
    actor_type: ServiceAccount
    when:
      $actor.scope: read
```

グローバルロールを grants で直接使用することはできません。リソースの[派生ロール](/ja/concepts/roles-and-relations#_1-global-role-derivation)から参照し、リソース内のロールに対応付けます。

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    # ...
    derived_roles:
      - role: admin
        from_global_role: superadmin
```

## リソース {#resources}

リソースはポリシーの中心です。各ブロックで、ロール、権限、ロールと権限の対応（grants）、他のリソースとの関係、派生ロール、条件付きルールを宣言します。

### ロールと権限 {#roles-and-permissions}

各リソースには、そのリソース上で持つことのできるロールと、チェックできる権限（操作）を宣言します。

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]
```

ロールは、特定のリソースインスタンスに対してアクターが持つラベルです。権限は、`can()` でチェックできる操作を表します。

### 権限付与 {#grants}

grants はロールを権限に対応付けます。宣言済みのすべての権限を付与するには `all` を使います。

```yaml
    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]
```

`all` はチェック時に、そのリソースで宣言されているすべての権限へ展開されます。後から権限を追加すると、その権限も自動的に含まれます。

### 関係 {#relations}

関係は、リソース間の型付きのつながりを定義し、リソースをまたいだロールの導出を可能にします。

```yaml
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: Project
      assignee: User
      watchers: User
```

各関係の値は、別のリソース型やアクター型を参照する型名の文字列です。関係には次の 2 つの用途があります。

1. **派生ロール**：親リソースのロールを伝播させます（[ロールと関係](/ja/concepts/roles-and-relations)）。
2. **条件**：ルールから関連リソースの属性を参照します（[条件とルール](/ja/concepts/conditions-and-rules)）。

### 派生ロール {#derived-roles}

派生ロールを使うと、明示的に割り当てなくても、アクターがリソース上のロールを自動的に取得できます。導出には 5 つのパターンがあります。

```yaml
    derived_roles:
      # 1. From a global role
      - role: admin
        from_global_role: superadmin

      # 2. From a role on a related resource
      - role: editor
        from_role: editor
        on_relation: project

      # 3. From a relation identity (actor IS the related entity)
      - role: editor
        from_relation: assignee

      # 4. From actor attributes with type restriction
      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering

      # 5. From conditions only
      - role: viewer
        when:
          $actor.department: engineering
```

各パターンの詳細は、[ロールと関係](/ja/concepts/roles-and-relations) を参照してください。

### ルール {#rules}

ルールは grants に条件付きのロジックを加えます。リソース、アクター、環境の属性に基づいて、操作を `permit`（許可）または `forbid`（禁止）できます。

```yaml
    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          resource.archived: true

      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          resource.isPublic: true
```

ルールは、そのリソース上で少なくとも 1 つのロールを持つアクターに対してのみ評価されます。`forbid` ルールは、`permit` ルールや grants より常に優先されます。条件式の構文全体は、[条件とルール](/ja/concepts/conditions-and-rules) を参照してください。

## 完全な例 {#complete-example}

主な機能を組み合わせたポリシーの例です。

```yaml
version: "1"

actors:
  User:
    attributes:
      email: string
      department: string
      isSuperAdmin: boolean

global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

resources:
  Organization:
    roles: [member, admin]
    permissions: [read, update, manage_members]

    grants:
      member: [read]
      admin: [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin

  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]

    relations:
      org: Organization

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]

    derived_roles:
      - role: admin
        from_role: admin
        on_relation: org

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

## ポリシーの読み込み {#loading-a-policy}

`loadYaml()` または `loadJson()` で、ポリシー文字列を解析して検証します。

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";

const policy = await loadYaml(readFileSync("./policy.yaml", "utf-8"));
const engine = new Toride({ policy });
```

ポリシーの検証は読み込み時に自動的に行われます。grants で未宣言のロールを参照する、条件で無効な演算子を使用するなどの誤りがあると、問題のあるノードへのパスを示すメッセージ付きの `ValidationError` がスローされます。

```
ValidationError: resources.Task.grants references undeclared role "edtor"
```

## ポリシーの合成 {#policy-composition}

ポリシーを複数のファイルに分割し、読み込み時に `mergePolicies()` で結合できます。

```typescript
import { readFileSync } from "node:fs";
import { loadYaml, mergePolicies } from "toride";

const base = await loadYaml(readFileSync("./base-policy.yaml", "utf-8"));
const extension = await loadYaml(readFileSync("./team-policy.yaml", "utf-8"));

const combined = mergePolicies(base, extension);
```

マージは追加的に行われ、両方のポリシーのリソースが統合されます。同じリソースを定義している場合は grants がマージされ、ルールは末尾に追加されます。同一ロールに異なる権限を指定する grants の競合は、検出されて報告されます。

## 次に読むページ {#what-s-next}

- [ロールと関係](/ja/concepts/roles-and-relations)：5 つのロール導出パターンを理解します。
- [条件とルール](/ja/concepts/conditions-and-rules)：条件式の構文全体を学びます。
- [部分評価](/ja/concepts/partial-evaluation)：データ層のクエリに認可条件を組み込みます。
