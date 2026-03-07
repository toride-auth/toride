---
source: toride monorepo (packages/toride)
timestamp: 2026-03-07T00:00:00Z
---

# RelationResolver の設計課題と改善案

## 現状の問題
- ResourceRef は type と id しか持たず、attribute を渡す手段がない
- 呼び出し元がすでに attribute を持っていても、resolver が必ず DB に取りに行く
- 1つの RelationResolver で全リソースタイプを扱うため、実装が ref.type の分岐だらけになる

## 改善の方向性

### 1. ResourceRef に attributes を持たせる
- あれば使い、なければ resolver（PIP）に fallback する
- per-attribute で考えるべき：部分的に渡された場合、足りない分だけ resolver に聞く

### 2. リソースタイプごとの resolver 定義
- 現在の1つの RelationResolver を、リソースタイプごとに分割する
- relation ごとの resolver も分けられると、責務が明確になる

### 3. 静的解析で必要な attribute を事前に特定
- ポリシーの when 節を解析し、評価前に「何が必要か」を知る
- 手元にある attribute と突き合わせて、足りないものだけ取りに行く

### 4. relation 先の attribute 取得
- $resource.workspace.plan のようなパスでは2つのリソースタイプの resolver が関わる
- 自リソースの attribute は「全部返す」で問題ないが、relation 先はコストが見えにくい
- v1 としてはシンプルに全部返す方式で十分。最適化は後から

## 未解決の問い
- DataLoader 的バッチングは await の直列評価と相性が悪い。代替策の検討が必要
- relation 先の attribute 取得の最適化はどこまでやるか
