---
description: リソースごとの Drizzle マッピング、中間操作記述、正確なネイティブ変換の要件、リゾルバーヘルパーを説明します。
---

# Drizzle 連携 {#drizzle-integration}

`@toride/drizzle` は制約を中間操作記述に変換します。アプリケーションが操作記述をネイティブの Drizzle 式に変換します。操作記述は `.where()` に渡せる SQL 式ではありません。

## インストール {#install}

```bash
pnpm add @toride/drizzle toride drizzle-orm
```

`drizzle-orm` はこのパッケージの省略可能な peer 依存関係です。リゾルバーヘルパーはネイティブの列の等値式を作るために使います。

## リソースのテーブルと関係の対応づけ {#bind-resource-tables-and-relations}

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { tasks, projects } from "./schema.js";

const adapter = createDrizzleAdapter(tasks, {
	resourceType: "Task",
	resources: { Project: projects },
	fields: { Task: { owner: "ownerId" } },
	relations: {
		Task: {
			project: {
				resourceType: "Project",
				cardinality: "one",
				sourceColumn: "projectId",
				targetColumn: "id",
			},
		},
	},
});
```
`resourceType` は必須で、ルートのテーブルを指定します。`resources` は関係先の範囲で使うテーブルを指定します。ネイティブの Drizzle 列メタデータからスカラー型と null 許容を取得します。`fields` は必要に応じてポリシーフィールドを物理列のキーに対応づけます。

関係は関係元リソースごとに指定します。関係先、物理的な結合列、多重度を宣言します。one と many はどちらも条件を満たす関連行の存在を表します。結合列には互換性のあるスカラー型が必要です。関係先はポリシーの宣言と一致する必要があります。

型引数の順序は `createDrizzleAdapter<S, TModelMap, TQueryMap>` のままです。最初に生成したスキーマ、2 番目に省略可能なモデルマップ、3 番目に操作記述のクエリマップを渡します。

## 問い合わせ前の変換 {#translate-and-lower-before-querying}

```typescript
const result = await engine.buildConstraints(actor, "read", "Task");
if (!result.ok) return [];
if (result.constraint === null) {
	return db.select().from(tasks).orderBy(tasks.id).limit(20);
}
const description = engine.translateConstraints(result.constraint, adapter);
const predicate = toNativePredicate(description);
return db.select().from(tasks).where(predicate).orderBy(tasks.id).limit(20);
```
`toNativePredicate` はアプリケーションのコードです。出力されるすべての操作を実装するか、エラーにする必要があります。完全な述語を行の選択、件数、ページに使い、その後にページングを適用します。非対応の操作を true に置き換えたり、取得したページを後から絞り込んだりしないでください。

## 操作記述 {#operation-descriptions}

スカラーの記述は、テーブル、リソース、null の扱いを持ちます。

```typescript
{
	_op: "eq",
	field: "status",
	value: "active",
	table: projects,
	resourceType: "Project",
	nullable: true,
	nullBehavior: "false",
	stringComparison: "binary",
}
```
| 制約 | 操作 |
| --- | --- |
| `field_eq`、`field_neq` | `eq`、`ne` |
| `field_gt`、`field_gte`、`field_lt`、`field_lte` | `gt`、`gte`、`lt`、`lte` |
| `field_in`、`field_nin` | `inArray`、`notInArray` |
| `field_exists` | `isNull`、`isNotNull` |
| `field_contains` | リテラル値を持つ `contains` |
| `field_starts_with` | リテラル値を持つ `startsWith` |
| `field_ends_with` | リテラル値を持つ `endsWith` |
| `and`、`or`、`not` | `children` または `child` の記述 |
| `always`、`never` | Boolean 値を持つ `literal` |
| `relation` | 完全な `child` 記述を持つ関連行の存在 |

通常のスカラー比較は null で false です。ネイティブ変換では `not` の適用前に、必ず true または false を返すようにします。たとえば null を許容する等値比較は `column IS NOT NULL AND column = value` に変換します。存在の確認は null の全体を評価します。関係の子が true の定数でも、関連行の存在が必要です。同じ物理テーブルを繰り返す場合は、関係の範囲ごとに別名を付けてください。

文字列操作は `stringComparison: "binary"` と JavaScript の一致規則を表します。`contains`、`startsWith`、`endsWith` はリテラル値を維持し、別々の操作になります。ネイティブ変換ではバックエンドとの一致を確認するか、操作を拒否してください。`LIKE` だけでは大文字小文字、Unicode、ワイルドカードのリテラル評価は保証できません。ローカルで検証した SQLite 変換は、NUL を含まない正しい Unicode 文字列に対して `instr` と `substr` を使います。この限定した検証は、すべての SQL バックエンドや保存文字列の範囲を保証しません。

未マッピングのフィールド、リソース、関係は `UnsupportedConstraintError` になります。数値以外の順序比較、未検証の JSON 操作、ネイティブのスカラー配列の含有は非対応です。判定に関係するカスタム条件と旧形式の手書き `has_role` ノードもエラーになります。

## 仮想フィールドの含有 {#virtual-membership}

仮想配列を明示的な many 関係に対応づけます。

```typescript
const adapter = createDrizzleAdapter(projects, {
	resourceType: "Project",
	resources: { Assignment: assignments },
	relations: {
		Project: {
			assignments: {
				resourceType: "Assignment",
				cardinality: "many",
				sourceColumn: "id",
				targetColumn: "projectId",
			},
		},
	},
	virtualFields: {
		Project: {
			viewer_ids: {
				relation: "assignments",
				matchField: "userId",
				filter: { role: "viewer" },
			},
		},
	},
});
```
リゾルバーの配列は、フィルターで選択した関連行の値と過不足なく一致する必要があります。仮想フィールド名はリソースごとに区別します。保存した割り当てデータはアプリケーションのマッピングであり、暗黙のロール割り当て操作ではありません。

## リゾルバーヘルパー {#resolver-helper}

```typescript
import { createDrizzleResolver } from "@toride/drizzle";

const projectResolver = createDrizzleResolver(db, projects);
const resolverWithUuid = createDrizzleResolver(db, documents, { idColumn: "uuid" });
```
ヘルパーは ID 列を検証し、ネイティブの `eq(table[idColumn], ref.id)` で問い合わせます。部分的な `ResolverData<S, R>` または `null` を非同期で返します。行がない場合は `null` です。`.where()` に通常のオブジェクトを渡さず、完全なポリシー属性を保証せず、外部キーから関係の参照を作りません。

## ローカル変更の検証 {#verify-local-changes}

リポジトリのルートから、実際のローカル SQLite クエリと公開 API の検証を実行できます。

```bash
scripts/verification/verify.sh check queries /tmp/toride-query-evidence
scripts/verification/verify.sh check types-and-policy /tmp/toride-type-evidence
```

検証コマンドはビルド後に公開パッケージを読み込み、期待した ID、件数、ページと実際の結果を比較します。型の検証は生成したファイルを TypeScript でコンパイルします。手順の詳細はリポジトリの `.claude/skills/verify-toride/SKILL.md` にあります。

## 移行 {#migration}

必須の `resourceType`、関係先のテーブル、関係元ごとの関係マッピングを追加します。推測に基づく `foreignKey` を、明示した `sourceColumn`、`targetColumn`、関係先、多重度に変更します。暗黙のロール割り当て設定を削除してください。

ネイティブ変換に、リソースの範囲、定数、null を含めた述語、別々のリテラル文字列操作への対応を追加します。行がない場合は `null` を返します。中間操作記述の契約と、既存の `buildConstraints()`、`translateConstraints()`、`ok` の手順は維持します。

[部分評価](/ja/concepts/partial-evaluation)と [Prisma 連携](/ja/integrations/prisma)も参照してください。
