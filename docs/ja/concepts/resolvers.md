---
description: リゾルバーとデフォルトリゾルバーについて、インライン属性と登録済みリゾルバーからの属性解決、およびマージ時の優先順位を説明します。
---

# リゾルバー {#resolvers}

リゾルバーは、評価時にリソースの属性を取得する関数です。`$resource.<field>` を参照する[条件](/ja/concepts/conditions-and-rules)を評価するためのデータを Toride に提供します。ただし、リゾルバーは**完全に任意**です。`ResourceRef` に属性を直接渡すと、エンジンはリゾルバーを呼ばずにその値を使います。これが**デフォルトリゾルバー**の動作です。

## デフォルトリゾルバー {#the-default-resolver}

リソース型に `ResourceResolver` が登録されていない場合、Toride はインライン属性を使います。これは、`can()` に渡す `ResourceRef` の `attributes` プロパティです。GraphQL でフィールドのリゾルバーが定義されていないときに、親オブジェクトの値を返すデフォルトリゾルバーと同じ考え方です。

Toride では、呼び出し元から渡す `ResourceRef` が「親オブジェクト」に相当します。含まれる属性は、リゾルバーを登録せずにそのまま条件評価へ利用できます。

### インライン属性だけを使う例 {#inline-only-example}

```typescript
import { createToride } from "toride";

const policy = {
  version: "1" as const,
  actors: { User: {} },
  resources: {
    Document: {
      roles: ["viewer"],
      permissions: ["read"],
      grants: { viewer: ["read"] },
      rules: [
        {
          effect: "permit" as const,
          permissions: ["read"],
          when: { "$resource.status": "published" },
        },
      ],
    },
  },
};

// No resolvers registered — inline attributes are the data source
const engine = createToride({ policy });

const allowed = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  { type: "Document", id: "doc-1", attributes: { status: "published" } },
);
// true — the condition $resource.status matches the inline attribute
```

これは Toride を使う最も簡単な方法です。呼び出し元がすでにデータを持っているため、リゾルバー関数を書く必要はありません。

### データがない場合 {#when-no-data-is-available}

リゾルバーが未登録で、**かつ**インライン属性もない場合、すべての `$resource.<field>` 参照は `undefined` になります。Toride は **null に対する厳格な評価規則**を適用します。`undefined` との比較は成立しないため、条件は一致せず、エンジンはデフォルトでアクセスを拒否します。

```typescript
const denied = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  { type: "Document", id: "doc-1" }, // no attributes
);
// false — $resource.status is undefined, condition fails, default deny
```

このフェイルクローズの動作により、データの欠落が誤ってアクセス許可につながることを防ぎます。

## 登録済みリゾルバー {#registered-resolvers}

データベースや API などから動的にデータを取得する場合は、エンジンの作成時に `ResourceResolver` を登録します。

```typescript
const engine = createToride({
  policy,
  resolvers: {
    Document: async (ref) => {
      const doc = await db.documents.findById(ref.id);
      return {
        status: doc.status,
        ownerId: doc.ownerId,
        org: { type: "Organization", id: doc.orgId },
      };
    },
  },
});
```

リゾルバーは `type` と `id` を持つ `ResourceRef` を受け取り、属性値と関係先への参照を含むフラットなオブジェクトを返します。Toride は、そのリソース型の条件評価や関係の探索が必要な場合にだけリゾルバーを呼び出します。

## マージ時の優先順位 {#merge-precedence}

同じリソースにインライン属性と登録済みリゾルバーの**両方**がデータを提供する場合、Toride は**インライン属性を優先**してマージします。

### リゾルバーとインライン属性を組み合わせる例 {#resolver-inline-merge-example}

```typescript
const engine = createToride({
  policy,
  resolvers: {
    Document: async (ref) => {
      // Resolver returns status: "draft"
      return { status: "draft", category: "internal" };
    },
  },
});

const allowed = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  {
    type: "Document",
    id: "doc-1",
    // Inline attribute overrides the resolver's status
    attributes: { status: "published" },
  },
);
// true — inline "published" wins over resolver's "draft"
```

マージはフィールドごとに行われます。

| フィールド | リゾルバーの値 | インラインの値 | 結果 |
|-------|---------------|--------------|--------|
| `status` | `"draft"` | `"published"` | `"published"`（インラインを優先） |
| `category` | `"internal"` | *指定なし* | `"internal"`（リゾルバーが補完） |

リゾルバーを基本のデータソースとしつつ、呼び出し元に新しいデータや、より具体的なデータがある場合には、特定のフィールドを上書きできます。

## 方式の選び方 {#choosing-an-approach}

| 方式 | 適した場面 |
|----------|-------------|
| **インラインのみ**（デフォルトリゾルバー） | 呼び出し元がすでに属性を持ち、追加のデータ取得が不要な場合 |
| **リゾルバーのみ** | 呼び出し元に属性がなく、動的な取得が必要な場合 |
| **リゾルバーとインラインの併用** | リゾルバーから基本データを取得し、呼び出し元で特定のフィールドを上書きする場合 |

単純なアプリケーションや、権限チェック前に REST ハンドラーでリソースを読み込む場合などは、デフォルトリゾルバーで定型コードを省けます。関係や入れ子のロール導出を使う複雑な場合には、リゾルバーを登録すると、認可ロジックをリクエストハンドラーから分離できます。

## 次に読むページ {#what-s-next}

- [ロールと関係](/ja/concepts/roles-and-relations)：関係に基づくロール導出へリゾルバーがデータを提供する仕組みを学びます。
- [条件とルール](/ja/concepts/conditions-and-rules)：リゾルバーのデータを使う条件式を学びます。
- [部分評価](/ja/concepts/partial-evaluation)：データ層のクエリに認可条件を組み込みます。
