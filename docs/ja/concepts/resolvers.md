---
description: 部分的なリゾルバーデータ、インライン属性、宣言された関係先、取得できない値と既知の不在の違いを説明します。
---

# リゾルバー {#resolvers}

リゾルバーは、権限判定に必要な属性と関係の参照を返します。データ取得が必要なリソース型に登録します。必要なデータをすべてインラインで渡す場合、登録は不要です。

## インライン属性 {#inline-attributes}

`ResourceRef.attributes` はスキーマから導出した部分データを受け取ります。インラインの値が優先されます。インラインで指定していないフィールドはリゾルバーが補います。

```typescript
const allowed = await engine.can(actor, "read", {
	type: "Document",
	id: "doc-1",
	attributes: { status: "published" },
});
```

省略したフィールドと `undefined` は、取得できない値を表します。明示的な `null` は、既知の不在を表します。この区別はインラインデータ、リゾルバーの戻り値、アクター属性、環境値に適用されます。

## 登録済みリゾルバー {#registered-resolvers}

`ResourceResolver<S, R>` は `Promise<ResolverData<S, R> | null>` を返します。`ResolverData` は宣言された属性の部分データと、省略可能な関係の参照から構成されます。`Resolvers<S>` はリソース型をこれらの関数に対応させます。

```typescript
import type { Resolvers } from "toride";
import type { GeneratedSchema } from "./generated/policy.js";

const resolvers: Resolvers<GeneratedSchema> = {
	Document: async (ref) => {
		const doc = await db.documents.findById(ref.id);
		if (!doc) return null;
		return {
			status: doc.status,
			org: doc.orgId ? { type: "Organization", id: doc.orgId } : null,
		};
	},
};
```

リソースが存在しない場合は `null` を返します。一部のフィールドだけを取得した場合は部分オブジェクトを返します。取得対象から除いたフィールドは取得できない値のままです。空オブジェクトは、リソースやフィールドが存在しないことを示しません。

1 回の判定内では、同じリソースのリゾルバーを最大 1 回呼び出します。アクターデータだけを使うポリシーでは、事前のリソース取得は不要です。既存の行が必要な操作では、アプリケーションで存在を確認してください。

## 関係の参照 {#relation-refs}

宣言された関係には、単一の参照、読み取り専用の参照配列、または `null` を返せます。参照の `type` はポリシーで宣言した関係先と一致する必要があります。`Task.assignee: User` のようにアクター型を関係先に指定できます。アクター型をリゾルバーマップのキーに追加する必要はありません。

```typescript
return {
	project: { type: "Project", id: task.projectId },
	assignee: task.assigneeId ? { type: "User", id: task.assigneeId } : null,
};
```

生成された型は、誤った関係先を拒否します。実行時にも、インラインの参照を含めてすべての参照を検証します。不正な参照や誤った関係先は判定不能になります。アクセスを許可するために別の関係先のポリシーを参照することはありません。

## データの不足とエラー {#missing-data-and-failures}

取得できない値は `exists: true` と `exists: false` のどちらも満たしません。既知の不在には明示的な `null` を使います。既知の不在に対する通常の比較は、等値比較も不等値比較も false です。

リゾルバーのエラー、不正な関係データ、循環、深さ制限、未登録のカスタム評価関数は、関連する条件を判定不能にします。アクセスには、許可または権限付与が true で、禁止が false であることが必要です。関連する禁止条件が判定不能なら、アクセスを拒否します。`explain()` は診断コードとパスを返します。

論理結合の規則は[条件とルール](/ja/concepts/conditions-and-rules#strict-null-semantics)を参照してください。

## マージとキャッシュの範囲 {#merge-and-cache-scope}

同じ参照では、インラインのフィールドがリゾルバーのフィールドより優先されます。1 回の判定内で同じ識別子に矛盾するインライン値を渡した場合は拒否します。インラインデータには信頼できる権限判定用データを渡してください。

リゾルバーはインラインデータを含む参照全体を使えるため、`canBatch()` は各項目を独立したキャッシュで評価します。項目の順序に依存せず、個別の判定と一致する結果を返します。リゾルバーの呼び出し回数は増える場合があります。アプリケーションでキャッシュする場合は、結果に影響するすべての入力をキーに含めてください。

## 移行 {#migration}

ポリシーの型を再生成すると、`ResolverMap = Resolvers<GeneratedSchema>` を取得できます。行がない場合は `null` を返します。既知の不在を示す `null` を維持し、ルールに必要なフィールドを取得してください。`exists: false` のために省略していた値は、明示的な不在に変更します。ポリシーの宣言と異なる関係先の参照を修正してください。

[コード生成](/ja/integrations/codegen)、[ロールと関係](/ja/concepts/roles-and-relations)、[部分評価](/ja/concepts/partial-evaluation)も参照してください。
