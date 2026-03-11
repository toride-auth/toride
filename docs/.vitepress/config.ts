import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "Toride",
  description: "Relation-aware authorization for TypeScript",
  base: "/toride/",

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
    },

    nav: [
      { text: "Guide", link: "/guide/why-toride" },
      { text: "Concepts", link: "/concepts/policy-format" },
      { text: "Integrations", link: "/integrations/prisma" },
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
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/toride-auth/toride" },
    ],
  },
});
