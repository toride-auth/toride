---
description: Toride の JSON Schema を使い、VS Code、JetBrains IDE、Neovim でポリシーの補完と検証を有効にする方法を説明します。
---

# IDE の設定ガイド {#ide-setup-guide}

Toride の JSON Schema を使い、エディターでポリシーファイルを検証できるようにします。

## 生成されるスキーマ {#generated-schema}

Toride はビルド時に `schema/policy.schema.json` を生成します。このスキーマによって、次の機能を利用できます。

- ポリシーのキーの自動補完
- 無効な値へのエラー表示
- ロール、関係、条件の型ヒント

## VS Code の設定 {#vs-code-setup}

### 前提条件 {#prerequisites}

VS Code に [Red Hat YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) 拡張機能をインストールしてください。

### 方法 1：ファイルごとのスキーマコメント {#method-1-per-file-schema-comment}

ポリシーファイルの先頭にスキーマコメントを追加します。

```yaml
# yaml-language-server: $schema=node_modules/toride/schema/policy.schema.json
version: "1"

actors:
  User:
    attributes:
      id: string

resources:
  Document:
    roles: [viewer, editor]
    permissions: [read, write]
    grants:
      admin: [all]

global_roles:
  admin:
    actor_type: User
    when:
      $actor.isAdmin: true
```

プロジェクト構成に合わせて、適切なパスに置き換えてください。

### 方法 2：ワークスペースの設定 {#method-2-workspace-settings}

`.vscode/settings.json` にスキーマの関連付けを追加します。

```json
{
  "yaml.schemas": {
    "node_modules/toride/schema/policy.schema.json": ["**/policy.yaml", "**/policy.yml"]
  }
}
```

特定のファイルパターンを指定することもできます。

```json
{
  "yaml.schemas": {
    "node_modules/toride/schema/policy.schema.json": ["policy.yaml", "policies/*.yaml"]
  }
}
```

### 方法 3：JSON Schema の URL（公開パッケージ向け） {#method-3-json-schema-url-for-published-packages}

公開済みの npm パッケージを使う場合は、URL でスキーマを参照できます。

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/toride-auth/toride/main/packages/toride/schema/policy.schema.json
```

> **注意**：URL でスキーマを参照する場合、インターネット接続が必要で、検証に時間がかかることがあります。

## その他のエディター {#other-editors}

YAML Language Server に対応する多くのエディターで、この JSON Schema を利用できます。

### JetBrains IDE（IntelliJ、WebStorm など） {#jetbrains-ides-intellij-webstorm-etc}

1. Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings を開きます。
2. `policy.schema.json` へのパスを指定して、新しいスキーマを追加します。
3. `policy.yaml` や `policies/*.yaml` などのファイルパターンを設定します。

### Neovim と YAML Language Server {#neovim-with-yaml-language-server}

`lspconfig` の設定に追加します。

```lua
require('lspconfig').yamlls.setup({
  settings = {
    yaml = {
      schemas = {
        ["path/to/node_modules/toride/schema/policy.schema.json"] = {
          "policy.yaml",
          "policies/*.yaml"
        }
      }
    }
  }
})
```

## 動作確認 {#verification}

次の手順で設定を確認します。

1. エディターでポリシーの YAML ファイルを開きます。
2. `invalidKey: true` など、無効なキーを追加します。
3. 無効なキーの下に赤い波線が表示されることを確認します。
4. 波線にカーソルを合わせて、エラーメッセージを確認します。

検証エラーが表示されない場合は、次を確認してください。

1. YAML 拡張機能が有効になっているか確認します。
2. スキーマへのパスが正しいか確認します。
3. 言語サーバーを再起動します。VS Code では `Ctrl+Shift+P` →「YAML: Restart Language Server」を実行します。
