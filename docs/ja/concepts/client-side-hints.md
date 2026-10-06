---
description: サーバーの engine.snapshot() と toride/client の TorideClient を使った権限スナップショット、デフォルト拒否の同期的な UI 権限チェック、React との連携を説明します。
---

# クライアント側の権限ヒント {#client-side-hints}

クライアント側の権限ヒントを使うと、サーバーからブラウザーに**権限スナップショット**を渡し、フロントエンドで即座に同期的な権限チェックを行って UI の表示を制御できます。「このボタンを表示するか」を決めるたびにサーバーへ問い合わせる代わりに、手元のスナップショットを参照します。

## 課題 {#the-problem}

フロントエンドでは、編集ボタン、削除アイコン、管理画面などを権限に応じて表示・非表示にする必要があります。権限ヒントがない場合には、次のような問題が生じます。

- UI の権限確認ごとに API を呼び出すと、遅延やリクエスト数が増えます。
- フロントエンドにも認可ロジックを複製すると、誤りやセキュリティ上のリスクにつながります。
- すべてを取得・表示してから 403 エラーを処理すると、使い勝手が悪くなります。

## 解決策：権限スナップショット {#the-solution-permission-snapshots}

Toride は次の 2 つを提供します。

1. **サーバー側**：ユーザーが閲覧しているリソースの `PermissionSnapshot` を生成します。
2. **クライアント側**：`TorideClient` で即座に同期的な権限チェックを行います。

### サーバー：スナップショットの生成 {#server-generate-a-snapshot}

`engine.snapshot()` で、複数のリソースに対する権限マップを生成します。

```typescript
import { readFileSync } from "node:fs";
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml(readFileSync("./policy.yaml", "utf-8")),
  resolvers: { /* ... */ },
});

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

// Generate a snapshot for the resources the user is viewing
const snapshot = await engine.snapshot(actor, [
  { type: "Project", id: "proj-1" },
  { type: "Project", id: "proj-2" },
  { type: "Task", id: "task-42" },
]);
```

スナップショットは、`"Type:id"` をキー、許可された操作名の配列を値とする、通常の JavaScript オブジェクトです。

```json
{
  "Project:proj-1": ["read", "update", "create_task"],
  "Project:proj-2": ["read"],
  "Task:task-42": ["read", "update", "delete"]
}
```

このオブジェクトは JSON にシリアライズできます。API レスポンス、SSR の props など、任意の方法でクライアントへ渡してください。

### `snapshot()` の仕組み {#how-snapshot-works}

`snapshot()` はルートのリソース識別子ごとに `permittedActions()` を呼び出します。同じインライン属性を持つ重複した参照は 1 回だけ評価し、矛盾する属性を持つ重複は拒否します。アクターのロール、grants、[ルール](/ja/concepts/conditions-and-rules)をすべて評価し、許可された操作を集めます。これにより、指定した各リソースインスタンスでアクターができる操作を把握できます。

```typescript
// For distinct resource identities:
const snapshot = await engine.snapshot(actor, resources);

// Manual equivalent:
const snapshot = {};
for (const resource of resources) {
  const key = `${resource.type}:${resource.id}`;
  snapshot[key] = await engine.permittedActions(actor, resource);
}
```

### クライアント：即座の権限チェック {#client-check-permissions-instantly}

`toride/client` サブパスから `TorideClient` をインポートします。このモジュールは**サーバー側の依存関係を持たず**、フロントエンドのバンドルに含められます。

```typescript
import { TorideClient } from "toride/client";

// Receive the snapshot from the server (e.g., via API response)
const client = new TorideClient(snapshot);

// Synchronous permission checks -- no async, no server calls
client.can("update", { type: "Project", id: "proj-1" });  // true
client.can("delete", { type: "Project", id: "proj-1" });  // false
client.can("read", { type: "Task", id: "task-42" });      // true
```

`TorideClient` はサーバーエンジンと同じく、**デフォルトで拒否**します。

- スナップショットにないリソースでは `false` を返します。
- 不明な操作では `false` を返します。
- 外部からの変更を防ぐため、構築時にスナップショットをコピーします。

### 許可された操作の一覧 {#list-permitted-actions}

リソースに対して許可された操作をすべて取得することもできます。

```typescript
const actions = client.permittedActions({ type: "Project", id: "proj-1" });
// ["read", "update", "create_task"]
```

## フロントエンドとの連携パターン {#frontend-integration-patterns}

### React の例 {#react-example}

```typescript
import { TorideClient } from "toride/client";
import { createContext, useContext } from "react";

// Create a context for the permission client
const PermissionContext = createContext<TorideClient | null>(null);

function usePermissions() {
  const client = useContext(PermissionContext);
  if (!client) throw new Error("PermissionContext not provided");
  return client;
}

// Provider: initialize from API response
function App({ snapshot }) {
  const client = new TorideClient(snapshot);

  return (
    <PermissionContext.Provider value={client}>
      <ProjectList />
    </PermissionContext.Provider>
  );
}

// Consumer: check permissions in components
function ProjectActions({ projectId }) {
  const permissions = usePermissions();
  const resource = { type: "Project", id: projectId };

  return (
    <div>
      {permissions.can("update", resource) && (
        <button>Edit</button>
      )}
      {permissions.can("delete", resource) && (
        <button>Delete</button>
      )}
    </div>
  );
}
```

### API レスポンスに含める {#api-response-pattern}

データとともに、API レスポンスにスナップショットを含めます。

```typescript
// Server-side API handler
app.get("/api/projects", async (req, res) => {
  const actor = getActorFromRequest(req);
  const projects = await listProjects(actor);

  // Build snapshot for the returned resources
  const resources = projects.map((p) => ({
    type: "Project" as const,
    id: p.id,
  }));
  const snapshot = await engine.snapshot(actor, resources);

  res.json({
    data: projects,
    permissions: snapshot,
  });
});
```

```typescript
// Client-side consumer
const response = await fetch("/api/projects");
const { data, permissions } = await response.json();

const client = new TorideClient(permissions);

// Now render the list with permission-aware UI
data.forEach((project) => {
  const canEdit = client.can("update", { type: "Project", id: project.id });
  // ...
});
```

### サーバーサイドレンダリング（SSR） {#server-side-rendering-ssr}

シリアライズした prop としてスナップショットを渡します。

```typescript
// Server: generate snapshot and pass as prop
async function getServerSideProps(context) {
  const actor = getActorFromSession(context.req);
  const projects = await listProjects(actor);
  const resources = projects.map((p) => ({ type: "Project", id: p.id }));
  const snapshot = await engine.snapshot(actor, resources);

  return {
    props: {
      projects,
      snapshot,
    },
  };
}
```

## スナップショットの範囲 {#snapshot-scope}

スナップショットには、明示的に列挙したリソースの権限だけが含まれます。これは次の理由によるものです。

- **セキュリティ**：クライアントには、閲覧対象として渡すリソースの情報だけを知らせます。
- **パフォーマンス**：評価するリソース数を正確に制御できます。
- **鮮度**：ユーザーが別の画面へ移動したときに、新しいスナップショットを生成できます。

### スナップショットの更新 {#refreshing-snapshots}

スナップショットは、ある時点の状態を表します。ロールの取り消しなどで権限が変わると、クライアントのスナップショットは古くなります。一般的な更新方法は次のとおりです。

- **画面遷移時**：新しいページや画面を読み込むときに生成し直します。
- **変更操作後**：権限が変わる可能性のある操作後に更新します。
- **定期ポーリング**：長時間開く SPA では、タイマーで更新します。

## パフォーマンス上の考慮事項 {#performance-considerations}

`snapshot()` はリソースごとに `permittedActions()` を呼び出し、宣言されたすべての権限を評価します。

- 計算量は **O(n * m)** です。n はリソース数、m はリソース型あたりの平均権限数です。
- リソースごとにロール解決と条件評価を行います。
- リゾルバーの結果はアクションごとの判定内でキャッシュします。属性や不在の観測をアクション間で共有しません。

リソース数が多い場合は、ページネーションを使い、表示中のページだけのスナップショットを生成することを検討してください。

`permittedActions()` は操作一覧に使うポリシーを 1 回取得し、各アクションを独立したキャッシュで評価します。各アクションは `can()` と同じ規則で判定し、先に評価したアクションの観測値を再利用しません。リゾルバーの呼び出し回数が増える場合があります。

`canBatch()` の各項目は独立したキャッシュを使います。リゾルバーがインライン属性を参照する場合でも、入力順序で判定結果が変わりません。共有キャッシュを使う場合よりリゾルバーの呼び出し回数が増えることがあります。1 回の判定内で同じ識別子に矛盾するインラインデータを渡した場合は拒否します。

### フィールド権限 {#field-permissions}

`canField()` と `permittedFields()` は、リソースの対応する操作が許可されていることを必要とします。フィールドのロール条件だけでリソースの拒否を上書きできません。たとえばリソースの read が拒否された場合、フィールドの read も拒否し、`permittedFields()` はそのフィールドを返しません。

## セキュリティ上の注意 {#security-notes}

クライアント側の権限ヒントは、**UI の表示専用**です。セキュリティ境界にはなりません。

- データの変更やアクセスでは、必ずサーバー側で認可を実施してください。
- スナップショットはクライアントの表示判断に使いますが、サーバーは各 API 呼び出しで `can()` を確認する必要があります。
- 悪意のあるクライアントはスナップショットを無視できます。実際の保護はサーバー側の認可が担います。

```typescript
// Server: always check permissions on mutations
app.post("/api/projects/:id", async (req, res) => {
  const actor = getActorFromRequest(req);
  const allowed = await engine.can(actor, "update", {
    type: "Project",
    id: req.params.id,
  });

  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Proceed with the update...
});
```

## 次に読むページ {#what-s-next}

- [部分評価](/ja/concepts/partial-evaluation)：データ層のクエリに認可条件を組み込みます。
- [ロールと関係](/ja/concepts/roles-and-relations)：スナップショットでのロール解決を理解します。
- [条件とルール](/ja/concepts/conditions-and-rules)：権限を決定するルールを学びます。
