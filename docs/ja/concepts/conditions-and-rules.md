---
description: ABAC の条件、参照パス（$actor、$resource、$env）、演算子、any/all による論理結合、禁止優先の原則、null に対する厳格な評価規則を説明します。
---

# 条件とルール {#conditions-rules}

条件とルールは、Toride のロールベースのモデルに属性ベースのアクセス制御（ABAC）を追加します。[grants](/ja/concepts/policy-format#grants) がロールと権限の静的な対応を定義するのに対し、ルールはリソースやアクターの属性、環境コンテキストに基づいて、条件付きで操作を許可または禁止します。

## ルールの概要 {#rules-overview}

ルールはリソースブロックの `rules` 配列で宣言します。各ルールには、**effect**（`permit` または `forbid`）、対象の **permissions**、および **when** 条件を指定します。

```yaml
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, publish]

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          $resource.archived: true

      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true
```

### ルールのフィールド {#rule-fields}

| フィールド | 必須 | 説明 |
|-------|----------|-------------|
| `effect` | はい | `permit` または `forbid` |
| `permissions` | はい | このルールを適用する権限名の配列 |
| `roles` | いいえ | 指定した場合、そのいずれかのロールを持つアクターにだけ適用 |
| `when` | はい | ルールを適用するために成立する必要がある条件式 |

### 評価順序 {#evaluation-order}

権限チェックでは次の順序で評価します。

1. すべての[ロール](/ja/concepts/roles-and-relations)（直接・派生）を解決します。
2. grants を展開して静的に付与される権限を求めます。
3. 要求された操作が付与されているかを確認します。
4. `permissions` に要求された操作を含むすべてのルールを評価します。
5. **禁止優先（forbid-wins）**の原則を適用します。

### 禁止優先の原則 {#the-forbid-wins-principle}

同じ操作に複数のルールが一致する場合、次の原則を適用します。

- **forbid** ルールは、**permit** ルールや静的な grants より常に優先されます。
- いずれかの forbid ルールの条件が成立すると、permit の有無にかかわらず操作を拒否します。
- **permit** ルールでは、静的な grants に含まれない権限を条件付きで付与できます。

```yaml
    rules:
      # Even admins cannot delete archived documents
      - effect: forbid
        permissions: [delete]
        when:
          $resource.archived: true

      # Viewers can update public documents (not in their static grants)
      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true
```

### ロールで対象を限定するルール {#role-scoped-rules}

任意の `roles` フィールドで、ルールの適用対象となるアクターを限定できます。

```yaml
    rules:
      # Only editors are affected by this restriction
      - effect: forbid
        roles: [editor]
        permissions: [delete]
        when:
          $resource.status: draft
```

`roles` を省略すると、そのリソース上で**いずれかの**ロールを持つすべてのアクターが対象になります。指定されたロールを 1 つも持たないアクターに対しては、ルール全体をスキップします。

## 条件式 {#condition-expressions}

`when` ブロックには条件式を記述します。最も単純な形式は、すべてを AND で結合するキーと値の組です。

```yaml
    when:
      $resource.status: active
      $actor.department: engineering
```

これは「リソースの `status` が `active` **かつ**アクターの `department` が `engineering`」という条件です。

### 参照パス {#reference-paths}

条件のキーは、評価時に値へ解決される参照パスです。

| 接頭辞 | 参照先 | 例 |
|--------|-------------|---------|
| `$actor.` | アクターの属性 | `$actor.department` |
| `$resource.` | リソースの属性 | `$resource.status` |
| `$env.` | 環境コンテキスト | `$env.currentTime` |

#### アクターの参照 {#actor-references}

[actors セクション](/ja/concepts/policy-format#actors)で宣言されたアクターの属性を参照します。

```yaml
    when:
      $actor.department: engineering
      $actor.isSuperAdmin: true
```

#### リソースの参照 {#resource-references}

リゾルバーによって解決される、現在のリソースの属性を参照します。

```yaml
    when:
      $resource.status: active
      $resource.priority: { gte: 3 }
```

#### 関連リソースの参照 {#nested-resource-references}

関係をたどって、関連リソースの属性を参照できます。

```yaml
    when:
      $resource.project.status: active
```

現在のリソースの `project` 関係を解決し、関係先の Project の `status` 属性を参照します。探索の深さは `maxConditionDepth` で設定できます（デフォルトは 3）。

#### 環境の参照 {#environment-references}

`CheckOptions` で渡した実行時コンテキストを参照します。

```yaml
    when:
      $env.currentTime: { gte: $resource.publishDate }
```

```typescript
const allowed = await engine.can(actor, "read", resource, {
  env: { currentTime: Date.now() },
});
```

省略した環境値と `undefined` は取得できない値です。条件は判定不能になります。関連する禁止条件が判定不能なら、アクセスを拒否します。明示的な `null` は既知の不在です。

### 参照同士の比較 {#cross-references}

条件の右辺には、リテラル値の代わりに別の参照パスを指定できます。

```yaml
    when:
      $actor.department: $resource.ownerDepartment
```

この例では、アクターの `department` 属性とリソースの `ownerDepartment` 属性を実行時に比較します。両辺に `$actor`、`$resource`、`$env` の任意の組み合わせを使用できます。

## 演算子 {#operators}

単純な等値比較以外には、演算子オブジェクトを使用します。

```yaml
    when:
      $resource.priority: { gte: 3 }
      $resource.name: { startsWith: "draft-" }
```

### 使用できる演算子 {#available-operators}

| 演算子 | 説明 | 例 |
|----------|-------------|---------|
| `eq` | 等しい（明示的な形式） | `{ eq: "active" }` |
| `neq` | 等しくない | `{ neq: "archived" }` |
| `gt` | より大きい | `{ gt: 5 }` |
| `gte` | 以上 | `{ gte: 3 }` |
| `lt` | より小さい | `{ lt: 10 }` |
| `lte` | 以下 | `{ lte: 100 }` |
| `in` | 値が配列に含まれる | `{ in: ["active", "review"] }` |
| `includes` | 配列が値を含む | `{ includes: "admin" }` |
| `exists` | 既知の値が存在するか、既知の不在かを確認する | `{ exists: true }` |
| `startsWith` | 文字列が指定の文字列で始まる | `{ startsWith: "proj-" }` |
| `endsWith` | 文字列が指定の文字列で終わる | `{ endsWith: ".md" }` |
| `contains` | 文字列が部分文字列を含む | `{ contains: "draft" }` |
| `custom` | カスタム評価関数 | `{ custom: "isBusinessHours" }` |

### 等値比較の省略形 {#equality-shorthand}

値だけを記述すると、`eq` 演算子の省略形になります。次の 2 つは同じ意味です。

```yaml
# Shorthand
$resource.status: active

# Explicit
$resource.status: { eq: active }
```

### `in` 演算子 {#the-in-operator}

値が配列に含まれるかを確認します。

```yaml
    when:
      $resource.status: { in: ["active", "review", "approved"] }
```

`in` 演算子では、配列の取得元に参照パスを使用することもできます。

```yaml
    when:
      $actor.department: { in: $resource.allowedDepartments }
```

### `includes` 演算子 {#the-includes-operator}

`in` とは逆に、配列フィールドが指定した値を含むかを確認します。

```yaml
    when:
      $resource.tags: { includes: "featured" }
```

### `exists` 演算子 {#the-exists-operator}

フィールドが存在し、null でないかを確認します。

```yaml
    when:
      $resource.deletedAt: { exists: false }  # Only non-deleted resources
      $resource.assigneeId: { exists: true }   # Must have an assignee
```

### カスタム評価関数 {#custom-evaluators}

宣言的に表現できないロジックは、`custom` 演算子で TypeScript 関数に委ねます。

```yaml
    rules:
      - effect: permit
        permissions: [publish]
        when:
          $resource.status: { custom: "isBusinessHours" }
```

エンジンの作成時に評価関数を登録します。

```typescript
const engine = new Toride({
  policy,
  resolvers,
  customEvaluators: {
    isBusinessHours: async (actor, resource, env) => {
      const hour = new Date().getHours();
      return hour >= 9 && hour < 17;
    },
  },
});
```

カスタム評価関数は、エラー時にフェイルクローズで動作します。

- `permit` ルールでは、エラーが起きるとルールは**不一致**となり、権限を付与しません。
- `forbid` ルールでは、エラーが起きるとルールは**一致**したものとして扱い、アクセスを拒否します。

## 論理結合 {#logical-combinators}

単純な AND 以外の複雑な条件には、`any`（OR）と `all`（AND）を使用します。

### `any`（OR） {#the-any-combinator-or}

少なくとも 1 つの子条件が true であれば成立します。

```yaml
    rules:
      - effect: permit
        permissions: [read]
        when:
          any:
            - $resource.isPublic: true
            - $actor.department: $resource.ownerDepartment
```

### `all`（AND） {#the-all-combinator-and}

すべての子条件が true である必要があります。平坦な条件と同じ意味ですが、`any` の内部で使用すると便利です。

```yaml
    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          any:
            - $resource.archived: true
            - all:
                - $resource.status: review
                - $actor.role: { neq: "lead" }
```

### 入れ子 {#nesting}

組み合わせを入れ子にして、複雑なロジックを表現できます。

```yaml
    when:
      any:
        - $actor.isSuperAdmin: true
        - all:
            - $actor.department: $resource.department
            - $resource.status: { in: ["draft", "active"] }
        - all:
            - $resource.isPublic: true
            - $resource.publishDate: { exists: true }
```

深い入れ子によるサービス拒否を防ぐため、深さには上限があります（デフォルトは 10 階層）。上限を超えると、対象の条件は判定不能になり、`explain()` は `depth_limit` を報告します。その条件だけではアクセスを許可できません。関連する禁止条件が判定不能なら、アクセスを拒否します。

## 不在と判定不能 {#strict-null-semantics}

条件には true、false、判定不能の 3 つの結果があります。

| 観測したデータ | 通常の比較 | `exists: true` | `exists: false` |
| --- | --- | --- | --- |
| 存在する値 | 演算子の規則で評価 | true | false |
| 明示的な `null`、または null の親 | false | false | true |
| 省略したキー、または `undefined` | 判定不能 | 判定不能 | 判定不能 |
| リゾルバーのエラー、不正な関係、未登録の評価関数 | 判定不能 | 判定不能 | 判定不能 |

この区別はアクター属性、環境値、インライン属性、部分的なリゾルバーデータに共通です。null との通常の比較は、`eq` も `neq` も false です。`exists: false` は既知の不在だけを満たします。フィールドの省略で不在を表していた場合は、明示的な `null` に移行してください。

`any` は true の子があれば true です。true の子がなく、判定不能の子があれば判定不能です。`all` は false の子があれば false です。false の子がなく、判定不能の子があれば判定不能です。

アクセスには、権限付与または permit が true で、関連する forbid がすべて false であることが必要です。ロールの条件にも同じ規則を適用します。禁止ルールのロール条件が判定不能でも、禁止を無視しません。`explain()` は結果と診断コード、パスを返します。

`contains`、`startsWith`、`endsWith` はそれぞれ部分文字列、接頭辞、接尾辞を評価します。実行時は JavaScript の文字列演算を使います。クエリ変換では、データベースの照合順序、大文字小文字、ワイルドカードがこの意味と一致する必要があります。アダプターが一致を保証できない操作は、明示的なエラーになります。

## 多重度：many と ANY による評価 {#cardinality-many-and-any-semantics}

リゾルバーが配列を返す関係（many の関係）を条件から参照すると、Toride は **ANY** で評価します。配列内の**いずれか**の要素が条件を満たせば、条件は true です。

```yaml
resources:
  Project:
    relations:
      members: User
    rules:
      - effect: permit
        permissions: [read]
        when:
          $resource.members.department: engineering
```

YAML では、関係は常に型名の文字列で記述します。one と many のどちらになるかは、実行時のリゾルバーの戻り値で決まります。配列を返すと many の関係として扱います。Project に 3 人のメンバーがいて、少なくとも 1 人の `department` が `engineering` なら、条件は成立します。

関係をたどる `exists: true` は、少なくとも 1 つの既知の値が存在する場合に true です。空の関係配列は既知の不在です。スカラー配列フィールドの `[]` は存在する値です。取得できない要素は `exists: false` の根拠になりません。

同じ many 関係に別々の条件を書く場合、それぞれ異なる関連行で成立しても一致します。関連先の派生ロールの条件は、1 つの関連行の中で全体を評価します。クエリ変換では、物理的な多重度をアダプターに明示します。

## 完全な例 {#complete-example}

複数の条件パターンを組み合わせたリソースの例です。

```yaml
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, publish, archive]

    relations:
      project: Project
      author: User

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    derived_roles:
      - role: editor
        from_relation: author
      - role: viewer
        from_role: viewer
        on_relation: project

    rules:
      # Nobody can modify archived documents
      - effect: forbid
        permissions: [update, delete, publish]
        when:
          $resource.archived: true

      # Viewers can update public documents
      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true

      # Only allow publishing during business hours
      - effect: forbid
        permissions: [publish]
        when:
          $resource.status: { custom: "isOutsideBusinessHours" }

      # Editors can archive if the document belongs to their department
      - effect: permit
        roles: [editor]
        permissions: [archive]
        when:
          $actor.department: $resource.project.department
```

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: {
    Document: async (ref) => {
      const doc = await db.document.findById(ref.id);
      return {
        archived: doc.archived,
        isPublic: doc.isPublic,
        status: doc.status,
        project: { type: "Project", id: doc.projectId },
        author: { type: "User", id: doc.authorId },
      };
    },
    Project: async (ref) => {
      const project = await db.project.findById(ref.id);
      return { department: project.department };
    },
  },
  customEvaluators: {
    isOutsideBusinessHours: async () => {
      const hour = new Date().getHours();
      return hour < 9 || hour >= 17;
    },
  },
});

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

// Check with environment context
const allowed = await engine.can(
  actor,
  "publish",
  { type: "Document", id: "doc-1" },
);
```

## 次に読むページ {#what-s-next}

- [ポリシー形式](/ja/concepts/policy-format)：YAML 全体の構造を確認します。
- [ロールと関係](/ja/concepts/roles-and-relations)：ロール導出のパターンを理解します。
- [部分評価](/ja/concepts/partial-evaluation)：条件をデータ層のクエリに変換します。
- [クライアント側の権限ヒント](/ja/concepts/client-side-hints)：権限スナップショットをフロントエンドに渡します。
