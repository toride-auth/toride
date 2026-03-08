import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Toride",
  description: "Relation-aware authorization for TypeScript",
  base: "/toride/",

  themeConfig: {
    search: {
      provider: "local",
    },

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Concepts", link: "/concepts/policy-format" },
      { text: "Integrations", link: "/integrations/prisma" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
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
