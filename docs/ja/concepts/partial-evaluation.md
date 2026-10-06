---
description: 正確な権限制約、リソースの範囲を維持する変換、非対応の操作、件数とページングの規則を説明します。
---

# 部分評価 {#partial-evaluation}

`buildConstraints()` はリソース型に対する権限判定を制約に変換します。`translateConstraints()` はその制約をアダプターのクエリ表現に変換します。公開 API の呼び出し手順は変わりません。

## 結果を使ったクエリ {#query-with-the-result}

```typescript
const result = await engine.buildConstraints(actor, "read", "Project", {
	env: { tenantId },
});

if (!result.ok) return [];

const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);

return prisma.project.findMany({ where, orderBy: { id: "asc" }, take: 20 });
```

| 結果 | 意味 |
| --- | --- |
| `{ ok: false }` | この判定を満たすリソースはない |
| `{ ok: true, constraint: null }` | リソースに対するフィルターは不要 |
| `{ ok: true, constraint }` | 完全な変換済み述語を適用する |

制約付きの結果は `ResourceConstraint<R>` を含みます。必須の `rootResourceType` によって、`result.constraint` を取り出した後もリソース型を維持します。変換結果の型はその入力から推論します。リソースの範囲がない手書き AST は拒否します。

## 正確性とデータの対応 {#exactness-and-data-correspondence}

コンパイラーは実行時と同じ条件の規則で、権限付与、permit、ロール条件、forbid を組み合わせます。アクセスには許可が true、禁止が false であることが必要です。省略したアクター属性や環境値は取得できない値です。AND から消えたり、禁止を無効にしたりしません。

関連ロールは、関係先の実際の導出条件を再帰的にコンパイルします。ロール割り当てテーブルを暗黙に参照しません。関係ノードは、関連行が存在し、子の条件全体を満たすことを表します。子が `always` でも関連行の存在が必要です。many 関係の別々の条件は異なる行で成立しても一致します。関連ロールの条件全体は 1 行の中で評価します。

アダプターのマッピングは、完全なデータベース値が宣言されたリゾルバーの観測値と対応することを表明します。任意の非同期リゾルバーコードや外部サービスの障害をクエリに変換するものではありません。同じ完全なデータベースの状態に対して、クエリ結果と実行時の判定を比較してください。

権限フィルターは `take`、`skip`、`limit`、`offset` より前に適用します。同じ述語を行の選択、件数、ページに使います。取得したページをアプリケーションで絞り込んでも、権限に基づく正しい件数や完全なページは保証できません。

```typescript
if (!result.ok) return { total: 0, rows: [] };
const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);
const [total, rows] = await prisma.$transaction([
	prisma.project.count({ where }),
	prisma.project.findMany({ where, orderBy: { id: "asc" }, skip: 20, take: 20 }),
]);
return { total, rows };
```

## 非対応の制約 {#unsupported-constraints}

標準の変換は、完全な述語を返すか `UnsupportedConstraintError` をスローします。データベースへの問い合わせ前に変換してください。判定に関係するカスタム条件、未マッピングの式、正確性を確認していないフィールド間比較、再帰的なロール構造、アダプターが対応しない操作を無制限のフィルターに置き換えません。

変換エラーを捕捉して `{}` に置き換えないでください。権限付き一覧操作を非対応として処理するか、ポリシーまたはマッピングを対応する正確な形式に変更します。個別の判定には引き続き `can()` を使えます。

## 制約ノード {#constraint-nodes}

| ノード | 意味 |
| --- | --- |
| `field_eq`、`field_neq` | 等値比較、不等値比較 |
| `field_gt`、`field_gte`、`field_lt`、`field_lte` | 順序比較 |
| `field_in`、`field_nin` | 含有、非含有 |
| `field_exists` | 既知の存在、既知の不在 |
| `field_includes` | スカラー配列、または明示的に対応づけた仮想フィールドの含有 |
| `field_contains` | リテラルの部分文字列 |
| `field_starts_with` | リテラルの接頭辞 |
| `field_ends_with` | リテラルの接尾辞 |
| `and`、`or`、`not` | 論理結合 |
| `relation` | 宣言された関係先に対する `quantifier: "any"` |
| `always`、`never` | 関係の中を含めた定数 |

旧形式の手書き `has_role` と `unknown` ノードは変換時にエラーになります。判定に関係するカスタム条件が `unknown` として残る場合もエラーになります。標準アダプターは割り当ての保存先を推測せず、不明な条件を無視しません。

## アダプターの契約 {#adapter-contract}

各コールバックは最後の引数に `ConstraintContext` を受け取ります。`context.resourceType` によって現在のモデルのフィールド、関係、仮想フィールドのマッピングを選びます。関係の子を変換する際は宣言された関係先のコンテキストに切り替えます。関係コールバック自身は関係元のコンテキストを受け取ります。

```typescript
interface ConstraintAdapter<TQueryMap extends Record<string, unknown>> {
	translate(constraint: LeafConstraint, context: ConstraintContext): TQueryMap[string];
	relation(field: string, resourceType: string, childQuery: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
	and(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
	or(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
	not(query: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
	always(context: ConstraintContext): TQueryMap[string];
	never(context: ConstraintContext): TQueryMap[string];
}
```

カスタムアダプターは常に true または false を返す述語を実装する必要があります。通常の比較は null で false です。否定はその述語全体の補集合を表します。null でない値との等値比較を否定した場合は、null の行も含みます。SQL の `NOT (nullable_column = value)` だけではこの契約を満たしません。

関係には、関係元、関係先、物理フィールドまたは結合、多重度の明示的なマッピングが必要です。ポリシーの関係宣言は文字列のままです。仮想フィールドはリソースごとに区別し、同名でも異なるマッピングを指定できます。

`contains`、`startsWith`、`endsWith` を別々に維持します。データベースの大文字小文字、Unicode、照合順序、ワイルドカードは JavaScript と異なる場合があります。正確な変換を確認できない操作は、アダプターまたはネイティブクエリへの変換処理が拒否する必要があります。

対応するマッピングと制限は [Prisma アダプター](/ja/integrations/prisma)と [Drizzle の操作記述](/ja/integrations/drizzle)を参照してください。

## 移行 {#migration}

`can()`、`explain()`、`buildConstraints()`、`translateConstraints()` と `ok` の分岐は維持します。制約を保存または受け渡す際は `rootResourceType` を保持してください。リソースごとのアダプターマッピングを追加します。カスタムアダプターにはコンテキストと定数のコールバック、および別々の接頭辞と接尾辞ノードへの対応を追加し、`hasRole` と `unknown` のコールバックを削除します。問い合わせ前に非対応の変換エラーを処理してください。

既知の不在には明示的な `null` を使います。必要なアクター属性や環境値がない場合は判定不能です。[条件とルール](/ja/concepts/conditions-and-rules#strict-null-semantics)と[リゾルバーの移行](/ja/concepts/resolvers#migration)も参照してください。
