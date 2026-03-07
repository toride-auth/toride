---
resource: toride monorepo (packages/toride) — RelationResolver design
last_session: 2026-03-07
---

# Session History

## 2026-03-07 (session 2)
- Topics discussed:
  - getRelated 廃止の可否を主要フレームワーク調査で検証（Cerbos, Cedar, OPA）
  - 全フレームワーク共通: PDP はデータを取りに行かない
  - getRelated の3つの使用パターン分析（属性アクセス, relation role, relation identity）
  - ネスト属性で3パターン全てカバー可能だが、on_relation + from_role は残す必要あり
  - Document が Organization の内部構造を知るべきではない（関心の分離）
  - resolver を1箇所で定義するのはスケールしない → per-type resolver
  - **GraphQL Resolver パターンとの類似性を発見** — toride の差別化要素
  - ResourceRef 認識はポリシーの relation 宣言で明示（自動認識ではない）
  - キャッシュ戦略: ${type}:${id} キー、ライフサイクルは現状維持
  - マイグレーション: pre-1.0 のため後方互換不要

- User's key insights:
  - アプリ側が認可を意識するコードを書く量を最小化したい
  - PIP としての resolver は必須（アプリと認可ポリシーの疎結合のため）
  - attributes の有無ではなくフィールド単位で判断すべき
  - GraphQL Resolver パターンが toride の設計コンセプトそのもの
  - これは認可エンジンとしてユニークなポジション

- Decisions made:
  - getRelated 廃止確定
  - per-type resolver（Resolvers = Record<string, fn>）
  - ResourceRef.attributes optional で inline 渡し対応
  - on_relation + from_role は維持（relation 先は attributes 内 ResourceRef から取得）
  - relation 宣言は型名のみの軽量宣言に簡素化
  - フィールド単位の trivial resolver パターン（あればそれを使う、なければ resolver）

- Open questions: なし（全て解決済み）

- Issues created:
  - #13 — Redesign RelationResolver for per-resource-type definitions and inline attribute support
  - #15 — Remove getRoles from RelationResolver — derive roles declaratively via policy
  - (NEW) — GraphQL Resolver pattern: remove getRelated, unify to per-type attribute resolvers

## 2026-03-07 (session 1)
- Topics discussed:
  - RelationResolver の3メソッド（getRoles, getRelated, getAttributes）の呼び出しタイミング
  - getRoles は毎回発火、getRelated/getAttributes はポリシー次第
  - ResolverCache の寿命（can() 単位 vs permittedActions の共有キャッシュ）
  - ResourceRef に attributes を持たせる提案（PIP パターン）
  - per-attribute での fallback 設計
  - 主要フレームワーク調査（Oso, Cerbos, OpenFGA, Cedar, Casbin）
  - getRoles 廃止の方針決定 — derived_roles + getAttributes で代替、タプル関係は OpenFGA 等に委譲
  - getRelated の扱い — ネスト attributes で代替できる可能性あり、未結論
  - リレーション先情報のネスト渡しが自然だが、様々なパターンで成り立つか未検証

- User's key insights:
  - getRoles は Zanzibar の劣化版。廃止すべき
  - toride は Zanzibar にならない。7-8割のアプリに不要
  - ロール判定は RBAC（actor 属性）、ルールは ABAC（resource/env 属性）で分離すべき
  - ネスト attributes が自然だが、認可ユースケースの知見が不足しており深堀りが必要

- Issues created:
  - #13 — Redesign RelationResolver for per-resource-type definitions and inline attribute support
  - #15 — Remove getRoles from RelationResolver — derive roles declaratively via policy
