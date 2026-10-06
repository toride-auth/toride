---
description: 各パッケージのインストール方法、Node.js 20 以降や TypeScript などの前提条件、プロジェクト構成を説明します。
---

# はじめに {#getting-started}

Toride は、リソース間の関係を考慮する TypeScript 向けの認可エンジンです。YAML でポリシーを定義し、任意のデータソースから属性を返す関数であるリゾルバーを用意すると、エンジンが権限チェックを処理します。データを絞り込むための部分評価にも対応しています。

## 前提条件 {#prerequisites}

- Node.js 20 以降
- TypeScript プロジェクト
- パッケージマネージャー（pnpm、npm、yarn のいずれか）

## インストール {#installation}

### コアパッケージ {#core-package}

まず、コアパッケージの `toride` をインストールします。

::: code-group

```bash [pnpm]
pnpm add toride
```

```bash [npm]
npm install toride
```

```bash [yarn]
yarn add toride
```

:::

### ORM アダプター（任意） {#orm-adapters-optional}

データの絞り込み（部分評価）が必要な場合は、使用する ORM のアダプターをインストールします。

::: code-group

```bash [Prisma]
pnpm add @toride/prisma
```

```bash [Drizzle]
pnpm add @toride/drizzle
```

:::

これらのアダプターは、認可の制約をクエリの WHERE 句に変換します。権限に基づいてデータを効率的に絞り込めます。

### コード生成（任意） {#code-generation-optional}

ポリシーファイルから型安全なリゾルバーの型を生成するには、codegen パッケージを開発依存関係としてインストールします。

```bash
pnpm add -D @toride/codegen
```

YAML ポリシーから TypeScript の型を生成することで、リゾルバーの実装とポリシー定義の整合性を保てます。

## パッケージ一覧 {#package-overview}

| パッケージ | 説明 |
|---------|-------------|
| `toride` | コア認可エンジン。ポリシーの読み込み、権限チェック、部分評価を担当 |
| `@toride/prisma` | Prisma アダプター。制約を Prisma の `where` 句に変換 |
| `@toride/drizzle` | Drizzle アダプター。制約を Drizzle 向けのクエリ記述に変換 |
| `@toride/codegen` | コード生成。YAML ポリシーから型付きリゾルバーのインターフェースを生成 |

## プロジェクトの構成 {#project-setup}

一般的な Toride プロジェクトは、次の 3 つで構成されます。

1. アクター、リソース、ロール、権限、条件などの認可ルールを定義する **YAML ポリシーファイル**
2. 各リソース型の属性をデータソースから取得する方法をエンジンに伝える **リソースリゾルバー**
3. ポリシーとリゾルバーを使って権限を判定する **エンジン**

最小限のプロジェクト構成は次のとおりです。

```
my-app/
├── policy.yaml          # Authorization policy
├── src/
│   ├── auth/
│   │   ├── resolver.ts  # Resource resolvers
│   │   └── engine.ts    # Engine setup
│   └── ...
└── package.json
```

## 次のステップ {#next-steps}

最初の権限チェックを実装してみましょう。[クイックスタート](/ja/guide/quickstart) で手順を説明しています。
