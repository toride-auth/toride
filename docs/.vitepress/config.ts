import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "Toride",
  description: "Relation-aware authorization for TypeScript",
  base: "/toride/",
  lang: "en",

  locales: {
    root: { label: "English", lang: "en" },
    ja: {
      label: "日本語",
      lang: "ja",
      description: "リソース間の関係を考慮する TypeScript 向け認可エンジン",
      themeConfig: {
        nav: [
          { text: "ガイド", link: "/ja/guide/why-toride" },
          { text: "基本概念", link: "/ja/concepts/policy-format" },
          { text: "連携", link: "/ja/integrations/prisma" },
          { text: "リファレンス", link: "/ja/reference/cli" },
        ],
        sidebar: [
          {
            text: "ガイド",
            items: [
              { text: "Toride を選ぶ理由", link: "/ja/guide/why-toride" },
              { text: "はじめに", link: "/ja/guide/getting-started" },
              { text: "クイックスタート", link: "/ja/guide/quickstart" },
            ],
          },
          {
            text: "基本概念",
            items: [
              { text: "ポリシー形式", link: "/ja/concepts/policy-format" },
              { text: "ロールと関係", link: "/ja/concepts/roles-and-relations" },
              { text: "リゾルバー", link: "/ja/concepts/resolvers" },
              { text: "条件とルール", link: "/ja/concepts/conditions-and-rules" },
              { text: "部分評価", link: "/ja/concepts/partial-evaluation" },
              { text: "クライアント側の権限ヒント", link: "/ja/concepts/client-side-hints" },
            ],
          },
          {
            text: "連携",
            items: [
              { text: "Prisma", link: "/ja/integrations/prisma" },
              { text: "Drizzle", link: "/ja/integrations/drizzle" },
              { text: "コード生成", link: "/ja/integrations/codegen" },
            ],
          },
          {
            text: "リファレンス",
            items: [
              { text: "CLI", link: "/ja/reference/cli" },
              { text: "IDE の設定", link: "/ja/reference/ide-setup" },
            ],
          },
        ],
        docFooter: { prev: "前のページ", next: "次のページ" },
        outline: { label: "このページの内容" },
        langMenuLabel: "言語を変更",
        sidebarMenuLabel: "メニュー",
        returnToTopLabel: "ページの先頭へ",
        skipToContentLabel: "コンテンツへスキップ",
        darkModeSwitchLabel: "外観",
        lightModeSwitchTitle: "ライトモードに切り替え",
        darkModeSwitchTitle: "ダークモードに切り替え",
      },
    },
  },

  transformHead({ pageData }) {
    if (pageData.relativePath === "404.md") return [];
    const path = pageData.relativePath.replace(/^ja\//, "");
    const route = path.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, ".html");
    const english = `https://toride-auth.github.io/toride/${route}`;
    const japanese = `https://toride-auth.github.io/toride/ja/${route}`;
    return [
      ["link", { rel: "canonical", href: pageData.relativePath.startsWith("ja/") ? japanese : english }],
      ["link", { rel: "alternate", hreflang: "en", href: english }],
      ["link", { rel: "alternate", hreflang: "ja", href: japanese }],
      ["link", { rel: "alternate", hreflang: "x-default", href: english }],
    ];
  },

  vite: {
    plugins: [
      llmstxt({
        domain: "https://toride-auth.github.io",
      }),
    ],
  },

  themeConfig: {
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: {
            // VitePress serializes this function for both indexing and browser queries.
            // Japanese prose needs word boundaries rather than whitespace splitting.
            tokenize(text) {
              const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
              return Array.from(segmenter.segment(text))
                .filter((part) => part.isWordLike)
                .map((part) => part.segment);
            },
          },
        },
        locales: {
          ja: {
            translations: {
              button: { buttonText: "検索", buttonAriaLabel: "ドキュメントを検索" },
              modal: {
                displayDetails: "詳細を表示",
                resetButtonTitle: "検索をクリア",
                backButtonTitle: "検索を閉じる",
                noResultsText: "検索結果が見つかりませんでした",
                footer: {
                  selectText: "選択",
                  selectKeyAriaLabel: "Enter キー",
                  navigateText: "移動",
                  navigateUpKeyAriaLabel: "上矢印キー",
                  navigateDownKeyAriaLabel: "下矢印キー",
                  closeText: "閉じる",
                  closeKeyAriaLabel: "Escape キー",
                },
              },
            },
          },
        },
      },
    },

    nav: [
      { text: "Guide", link: "/guide/why-toride" },
      { text: "Concepts", link: "/concepts/policy-format" },
      { text: "Integrations", link: "/integrations/prisma" },
      { text: "Reference", link: "/reference/cli" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Why Toride", link: "/guide/why-toride" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Quickstart", link: "/guide/quickstart" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Policy Format", link: "/concepts/policy-format" },
          {
            text: "Roles & Relations",
            link: "/concepts/roles-and-relations",
          },
          { text: "Resolvers", link: "/concepts/resolvers" },
          {
            text: "Conditions & Rules",
            link: "/concepts/conditions-and-rules",
          },
          {
            text: "Partial Evaluation",
            link: "/concepts/partial-evaluation",
          },
          {
            text: "Client-Side Hints",
            link: "/concepts/client-side-hints",
          },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "Prisma", link: "/integrations/prisma" },
          { text: "Drizzle", link: "/integrations/drizzle" },
          { text: "Codegen", link: "/integrations/codegen" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/reference/cli" },
          { text: "IDE Setup", link: "/reference/ide-setup" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/toride-auth/toride" },
    ],
  },
});
