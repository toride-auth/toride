---
source: toride monorepo (packages/toride)
timestamp: 2026-03-07T00:00:00Z
---

# RelationResolver の呼び出しタイミングとキャッシュ戦略

## resolver は毎回呼ばれる
- `can()` を呼ぶたびに `resolveRoles()` → `resolver.getRoles()` が必ず発火する
- ポリシーの内容（derived_roles やルールの有無）に関わらず、getRoles は毎回走る
- これは意図的な設計：認可チェックは「最後の砦」なので、常に最新のデータで判定する必要がある

## キャッシュの寿命
- `can()` 1回ごとに `new ResolverCache()` が生成される → 1回の評価内でのみ有効
- 同じ `can()` の中で同じリソースの getRoles が複数回必要になった場合のみキャッシュヒットする
- `can()` をまたいだキャッシュ共有はしない → DBの変更を即座に反映するため

## permittedActions / canBatch は共有キャッシュ
- これらは内部で複数の action を順番に評価するが、1つの `ResolverCache` を使いまわす
- UI表示用のヒントであり、最終的には個別の `can()` がガードするため、キャッシュ共有によるわずかな不整合は許容される
