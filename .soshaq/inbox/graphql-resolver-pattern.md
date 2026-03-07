---
source: toride monorepo (packages/toride)
timestamp: 2026-03-07T00:00:00Z
---

# getRelated 廃止 — GraphQL Resolver パターンへの転換

## 結論

getRelated と getRoles を廃止し、resolver を per-type の getAttributes のみに統一する。
設計コンセプトは GraphQL Resolver パターンの転用。これは認可エンジンとしてユニーク。

## 核心: GraphQL Resolver パターン

1. **Per-type resolver**: リソースタイプごとに resolver を定義
2. **Trivial resolver**: attributes にフィールドがあればそのまま使う（resolver 呼ばない）
3. **Lazy cascading**: ポリシーが要求するパスだけ、階層的に解決する

判断基準は「attributes オブジェクトの有無」ではなく「必要なフィールドの有無」。

## 主要フレームワーク調査結果

| | Cerbos | Cedar | OPA | toride (新) |
|---|--------|-------|-----|-------------|
| データの渡し方 | 全部リクエスト時 | Entity Store 事前構築 | data に全部 | attributes + resolver 補完 |
| リレーション | なし（ネスト属性） | Entity 階層 (in) | なし | attributes 内 ResourceRef |
| derived roles | 属性条件のみ | N/A | Rego で自由 | 属性条件 + on_relation 維持 |
| PDP 内データフェッチ | しない | しない | しない | resolver（PIP）がフィールド単位で補完 |

toride の差別化: 認可エンジンで GraphQL Resolver パターンを採用しているものは他にない。
「持っていればそれを使う、足りなければ型ごとの resolver が補完する」は toride 独自のポジション。

## 新しい型設計

```typescript
interface ResourceRef {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}

type Resolvers = Record<string, (ref: ResourceRef) => Promise<Record<string, unknown>>>;

interface TorideOptions {
  readonly policy: Policy;
  readonly resolvers?: Resolvers;  // optional — attributes だけでも動く
}
```

## ポリシーの relation 宣言

relation は残すが型名だけの軽量宣言に（cardinality 不要）。
エンジンが attributes 内のどのフィールドが ResourceRef かを知るために使う。

```yaml
# Before
relations:
  org:
    resource: Organization
    cardinality: one

# After
relations:
  org: Organization
```

## on_relation + from_role は維持

getRelated は消えるが、on_relation + from_role パターンは維持。
relation 先の ResourceRef は attributes から取得（ポリシーの relation 宣言で認識）。
relation 先のロール評価はその型の resolver とポリシーで行う。
Document は Organization の内部構造を知らない。

## 解決フロー例: $resource.org.plan

1. Document:d1 の attributes に org フィールドあるか → あればそのまま
2. なければ resolvers.Document(ref) を呼ぶ
3. org の値が relation 宣言に一致 → ResourceRef と認識
4. org オブジェクト内に plan フィールドあるか → あればそのまま（trivial resolver）
5. なければ resolvers.Organization(ref) を呼ぶ
6. plan: "pro" を取得

## カスケード時の inline attributes

ResourceRef の type/id 以外のフィールドは、その先の inline attributes として引き継ぐ。

```typescript
// org に plan が含まれていれば resolvers.Organization は呼ばれない
{ org: { type: "Organization", id: "org1", plan: "enterprise" } }

// plan がなければ resolvers.Organization が呼ばれて補完
{ org: { type: "Organization", id: "org1" } }
```

## キャッシュ戦略

- キー: `${type}:${id}`（メソッドが1つなので method prefix 不要）
- ライフサイクル: can() 1回ごとに新キャッシュ（現状維持）
- permittedActions / canBatch は共有キャッシュ（現状維持）

## 消えるもの

- getRoles → derived_roles + attributes で代替
- getRelated → attributes 内の ResourceRef + per-type resolver で代替
- RelationDef の cardinality → relation 宣言は型名のみに簡素化
- condition.ts の relation 判定ロジック → ネスト属性アクセスに統一
- role-resolver.ts の evaluateRelationRole → on_relation は維持、getRelated → attributes
- role-resolver.ts の evaluateRelationIdentity → when 条件に統一
- ResolverCache の 3 メソッド → getAttributes 1 つだけに

## マイグレーション

pre-1.0 のため後方互換は不要。破壊的変更として実施。
