---
description: toride validate と toride test の引数、オプション、終了コード、出力例、ポリシーのテスト形式を説明します。
---

# CLI リファレンス {#cli-reference}

Toride は、ポリシーの検証とテスト実行のための CLI コマンドを提供します。

## `toride validate` {#toride-validate}

ポリシーファイルの構造を検証します。必要に応じて相互参照の検証も行えます。

**書式**：`toride validate [--strict] <policy-file>`

### 引数 {#arguments}

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `<policy-file>` | はい | YAML または JSON のポリシーファイルへのパス |

### オプション {#flags}

| オプション | 説明 |
|------|-------------|
| `--strict` | 構造の検証に加え、未宣言のロールや無効な関係などの相互参照を検証 |

### 終了コード {#exit-codes}

| コード | 意味 |
|------|---------|
| `0` | ポリシーは有効 |
| `1` | 検証失敗（エラーを標準エラー出力に表示） |

### 出力 {#output}

**成功時：**

```
Policy is valid.
```

`--strict` を指定し、警告がある場合：

```
Policy is valid (with warnings).
```

**失敗時：**

```
Error: <message>
```

### 使用例 {#examples}

```bash
# Validate a policy file
toride validate policy.yaml

# Validate with strict mode (cross-reference checks)
toride validate --strict policy.yaml
```

---

## `toride test` {#toride-test}

ポリシーファイルに定義されたテストを実行し、ポリシーの動作を検証します。

**書式**：`toride test <file-or-glob> [...]`

### 引数 {#arguments-1}

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `<file-or-glob>` | はい（1 つ以上） | テストを含むポリシーファイル、`.test.yaml` ファイル、または glob パターン |

### テストファイルの形式 {#test-file-formats}

#### インラインテスト {#inline-tests}

ポリシーファイルに `tests:` セクションを含めます。

```yaml
version: "1"

actors:
  User:
    attributes:
      id: string

resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, write]
    grants:
      admin: [all]

global_roles:
  admin:
    actor_type: User
    when:
      $actor.isAdmin: true

tests:
  - name: admin can read any document
    actor:
      type: User
      id: "user-1"
      attributes:
        isAdmin: true
    resource:
      type: Document
      id: "doc-123"
    action: read
    expected: allow
```

#### 別ファイルのテスト {#separate-test-file}

`*.test.yaml` ファイルに、`policy:`（相対パス）と `tests:` 配列を記述します。

```yaml
policy: ./policy.yaml

tests:
  - name: admin can read any document
    actor:
      type: User
      id: "user-1"
      attributes:
        isAdmin: true
    resource:
      type: Document
      id: "doc-123"
    action: read
    expected: allow
```

### 終了コード {#exit-codes-1}

| コード | 意味 |
|------|---------|
| `0` | すべてのテストが成功 |
| `1` | 1 つ以上のテストが失敗 |

### 出力 {#output-1}

**各テスト：**

- 成功：`✓ <name>`
- 失敗：`✗ <name>` と、期待値および実際の値

**集計：**

- `N tests passed`
- `N passed, M failed`

### 使用例 {#examples-1}

```bash
# Run tests in a single file
toride test policy.test.yaml

# Run tests with glob pattern
toride test "**/*.test.yaml"

# Run multiple specific files
toride test policy.test.yaml another-test.yaml
```
