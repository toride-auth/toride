---
description: Prisma のフィールド、関係、仮想フィールドの明示的なマッピング、部分データのリゾルバー、正確なクエリの制限を説明します。
---

# Prisma 連携 {#prisma-integration}

`@toride/prisma` は Toride の制約を Prisma の `where` オブジェクトに変換します。変換前に、ポリシーが使う物理フィールドと関係を設定してください。

## インストール {#install}

```bash
pnpm add @toride/prisma toride
```

アダプターは `@prisma/client` をインポートしません。アプリケーションがクライアントを渡します。モデルのペイロード型を渡すと、マッピングを型で検証できます。

## フィールドと関係の対応づけ {#bind-fields-and-relations}

この例は、ポリシーに `Project.status`、`Project.archived`、`Task.project: Project` があることを前提にしています。

```typescript
import { createPrismaAdapter } from "@toride/prisma";
import type { GeneratedSchema } from "./generated/policy.js";

const adapter = createPrismaAdapter<GeneratedSchema>({
	fields: {
		Project: {
			id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
			status: { field: "status", type: "string", nullable: false, stringComparison: "binary" },
			archived: { field: "archived", type: "boolean", nullable: false },
		},
		Task: {
			id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
		},
	},
	relations: {
		Task: {
			project: { field: "project", resourceType: "Project", cardinality: "one" },
		},
	},
});
```
フィールドのマッピングは物理名、スカラー型、null 許容を宣言します。文字列の等値比較と含有には `stringComparison: "binary"` が必要です。これは大文字小文字を区別し、照合順序による正規化がなく、NUL を含まない正しい Unicode データの比較が JavaScript と一致することを表明します。

関係のマッピングは関係元リソースごとに指定します。関係先はポリシーと一致する必要があります。`cardinality` は物理関係の `"one"` または `"many"` を宣言します。one は Prisma の `is`、many は `some` に変換します。どちらも子の条件全体を満たす関連行の存在が必要です。

省略可能な第 2 型引数に `{ Project: Prisma.$ProjectPayload; Task: Prisma.$TaskPayload }` などのモデルペイロードを指定できます。物理スカラー名、null 許容、関係フィールド、多重度を検証します。アクター型だけの関係先に `User.id` などが必要な場合は、そのモデルペイロードも含めます。

## クエリ、件数、ページ {#query-count-and-page}

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");
if (!result.ok) return { total: 0, rows: [] };
const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);
const [total, rows] = await prisma.$transaction([
	prisma.project.count({ where }),
	prisma.project.findMany({ where, orderBy: { id: "asc" }, take: 20 }),
]);
return { total, rows };
```
問い合わせ前に制約を変換します。件数とページに同じ完全な述語を使ってください。`UnsupportedConstraintError` は、この一覧クエリを正確に変換できないことを示します。空のフィルターへの置き換えや、取得後のページの絞り込みはしないでください。

## 仮想フィールドの含有 {#virtual-membership}

仮想配列は、明示した物理関係の行に対応できます。`Project.viewer_ids` を文字列配列として宣言したポリシーでは、次のオプションを `createPrismaAdapter()` に追加します。

```typescript
virtualFields: {
	Project: {
		viewer_ids: {
			relation: "roleAssignments",
			matchField: "userId",
			filter: { role: "viewer" },
			cardinality: "many",
			valueType: "string",
			stringComparison: "binary",
		},
	},
}
```
このマッピングは含有を、指定したフィルター付きの `roleAssignments.some` に変換します。リゾルバーの配列が、関連行の値と過不足なく対応することを表明します。暗黙のロール割り当て API は作りません。別のリソースの同名の仮想フィールドには異なるマッピングを指定できます。

## スカラーと文字列の制限 {#scalar-and-string-limits}

通常の比較は null を除外します。否定は完全な述語の補集合を含み、必要に応じて null の行も含みます。`field_exists` は物理フィールドの null を確認します。順序比較は数値フィールドに対応します。ネイティブのスカラー配列の含有、正確性を確認していない JSON、フィールド間の操作は非対応です。

`contains`、`startsWith`、`endsWith` はそれぞれ別の Prisma フィルターです。バイナリ等値比較に加えて、フィールドに `stringFilters: "javascript"` が必要です。プロバイダー、接続設定、保存した文字列の一致規則が JavaScript と同じ場合だけ指定してください。`%`、`_`、バックスラッシュ、NUL を含むパターンは拒否します。すべてのプロバイダーに共通の保証はありません。この表明がない文字列フィルターはエラーになります。

## リゾルバーヘルパー {#resolver-helper}

```typescript
import { createPrismaResolver } from "@toride/prisma";

const projectResolver = createPrismaResolver<GeneratedSchema, "Project", "project">(
	prisma,
	"project",
	{ select: { status: true, archived: true } },
);
```
ヘルパーは `findUnique({ where: { id: ref.id }, select })` を呼び出します。`ResolverData<GeneratedSchema, "Project"> | null` を非同期で返します。行がない場合は `null` です。選択から除いた属性は取得できない値です。`select` はスカラー属性と `id` の選択に使います。型付きスキーマでは、宣言された関係のキーを TypeScript が拒否します。完全なポリシー属性を返すとは保証せず、生の関連行や外部キーから型付きの関係の参照を作りません。仮想配列や宣言された関係の参照には、型付きのカスタムリゾルバーを使ってください。

## ローカル変更の検証 {#verify-local-changes}

リポジトリのルートから、実際のローカル SQLite クエリと公開 API の検証を実行できます。

```bash
scripts/verification/verify.sh check queries /tmp/toride-query-evidence
scripts/verification/verify.sh check types-and-policy /tmp/toride-type-evidence
```

検証コマンドはビルド後に公開パッケージを読み込み、期待した ID、件数、ページと実際の結果を比較します。型の検証は生成したファイルを TypeScript でコンパイルします。手順の詳細はリポジトリの `.claude/skills/verify-toride/SKILL.md` にあります。

## 移行 {#migration}

旧形式の平坦な `relationMapping` を、関係元ごとの `relations` に変更し、関係先と多重度を指定します。判定に関係する制約が使うすべてのスカラーを `fields` に追加してください。関係先との同一性に使う ID も含めます。暗黙の `roleAssignmentTable` と `roleAssignmentFields` オプションを削除します。保存した割り当ては、ポリシー属性と明示的な仮想マッピングで表現してください。

仮想マッピングにスカラーと多重度の意味を追加します。行がない場合は `null` を返し、リゾルバーの型を再生成してください。宣言された関係の選択は、関係先の `type` と `id` を持つ参照を構築するカスタムリゾルバーに移します。`buildConstraints()`、`translateConstraints()`、`ok` の分岐は維持します。

[部分評価](/ja/concepts/partial-evaluation)と[リゾルバー](/ja/concepts/resolvers)も参照してください。
