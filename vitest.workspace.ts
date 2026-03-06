import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/toride",
  "packages/codegen",
  "packages/prisma",
  "packages/drizzle",
]);
