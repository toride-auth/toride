---
layout: home

hero:
  name: Toride
  text: リソース間の関係を考慮する TypeScript 向け認可エンジン
  tagline: 認可モデルを YAML で定義し、任意のデータソースと接続。ロールの伝播やデータの絞り込みは、エンジンに任せられます。
  actions:
    - theme: brand
      text: Toride を選ぶ理由
      link: /ja/guide/why-toride
    - theme: alt
      text: はじめに
      link: /ja/guide/getting-started
    - theme: alt
      text: GitHub で見る
      link: https://github.com/toride-auth/toride

features:
  - title: YAML ポリシーと型安全性
    details: ロール、関係、条件、権限付与を 1 つの YAML ファイルに宣言し、認可モデル全体を定義できます。コード生成により、リゾルバーをコンパイル時に検証できます。
  - title: データベースに依存しない設計
    details: リゾルバーは通常の関数です。インメモリのオブジェクト、REST API、データベースなど、任意のデータソースから属性を返せます。専用のインフラは不要です。
  - title: リソース間の関係を考慮
    details: YAML でリソース階層を表現し、関係を通じてロールを自動的に導出できます。ロールを手動で伝播させる必要はありません。
---
