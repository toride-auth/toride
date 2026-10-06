import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Policy } from "toride";
import { describe, expect, it } from "vitest";
import { generateTypes } from "./generator.js";

const policy: Policy = {
  version: "1",
  actors: { User: { attributes: { name: "string" } } },
  resources: {
    Project: {
      roles: ["viewer"],
      permissions: ["read"],
      attributes: { title: "string", published: "boolean" },
    },
    Task: {
      roles: ["viewer"],
      permissions: ["read"],
      attributes: { title: "string", priority: "number" },
      relations: { project: "Project", assignee: "User", reviewers: "User" },
    },
  },
};

function compileConsumer(source: string): string[] {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(packageRoot, ".bindings-consumer-"));
  try {
    const bindings = join(directory, "bindings.ts");
    const consumer = join(directory, "consumer.ts");
    writeFileSync(bindings, generateTypes(policy));
    writeFileSync(consumer, source);
    const program = ts.createProgram([bindings, consumer], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("generated resolver consumers", () => {
  it("accepts partial data, absent rows, and declared resource and actor relation refs", () => {
    const diagnostics = compileConsumer(`
      import type { ResolverMap, GeneratedSchema } from "./bindings.js";
      import type { ResourceRef } from "toride";
      const resolvers: ResolverMap = {
        Project: async (ref) => ref.id === "missing" ? null : { title: null },
        Task: async (ref) => ({
          title: ref.attributes?.title ?? "draft",
          project: { type: "Project", id: "p1", attributes: { published: true } },
          assignee: { type: "User", id: "u1", attributes: { name: null } },
          reviewers: [{ type: "User", id: "u2" }] as const,
        }),
      };
      const task: ResourceRef<GeneratedSchema, "Task"> = {
        type: "Task", id: "t1", attributes: { project: null, priority: 1 },
      };
    `);
    expect(diagnostics).toEqual([]);
  });

  it.each([
    ['Task: async () => ({ priority: "high" })', /string.*not assignable.*number/s],
    ['Task: async () => ({ project: { type: "Task", id: "t1" } })', /Task.*not assignable.*Project/s],
    ['Task: async () => ({ reviewers: [{ type: "Project", id: "p1" }] })', /Project.*not assignable.*User/s],
    ['User: async () => ({ name: "Alice" })', /User.*does not exist/s],
  ])("rejects invalid generated resolver data %s", (entry, expected) => {
    const diagnostics = compileConsumer(`
      import type { ResolverMap } from "./bindings.js";
      const resolvers: ResolverMap = { ${entry} };
    `);
    expect(diagnostics.join("\n")).toMatch(expected);
  });
});
