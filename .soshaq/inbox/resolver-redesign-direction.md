---
source: toride monorepo (packages/toride)
timestamp: 2026-03-07T00:00:00Z
---

# RelationResolver 再設計 — 方針と未解決の問い

## 確定した方針

### getRoles は廃止方向
- 属性から導出できるロール → derived_roles + ポリシー YAML で解決済み
- 多対多のロール関係（タプル） → toride のスコープ外。OpenFGA 等と組み合わせる設計
- 逃げ道: $resource.editors のように属性として表現し、getAttributes で resolver を書く
- getRoles は Zanzibar の劣化版であり、1つの関数で全リソースタイプを扱う設計は型安全でなく直感的でもない

### getAttributes は残すが改善する
- ResourceRef に attributes を持たせ、あればそれを使い、なければ resolver（PIP）に fallback
- リソースタイプごとの resolver 定義に分割する

### リレーション先の情報はネストした attributes で渡すのが自然
- $resource.workspace.plan のようなパスに対して、ネストしたオブジェクトで渡せるべき
- 渡されていれば getRelated + getAttributes を省略できる

## 未解決の問い（ナレッジを深めるべき領域）

### 1. ネストした attributes が様々なパターンで成り立つか
- 1対1のリレーション（document → workspace）は自然だが、1対多は？
- リレーションの深さが2段以上（document → workspace → organization）の場合は？
- ポリシーの $resource.xxx パスとの整合性はどうなるか

### 2. getRelated の扱い
- getRoles と同じ論理で廃止できるのか、それとも残すべき理由があるのか
- ネスト attributes で代替できるケースと、できないケースの境界はどこか

### 3. 世の中のユースケースパターンの理解
- 認可でリレーションが必要になる典型的なパターンの網羅的な理解が不足
- Cerbos, Cedar がリレーションなしでどこまでカバーできているかの実例研究

### 4. derived_roles の設計見直し
- getRoles 廃止後、現在の5パターンのうちどれが残り、どれが変わるか
- RBAC と ABAC の境界をどこに引くか（ロール判定に $resource を使うべきか）
