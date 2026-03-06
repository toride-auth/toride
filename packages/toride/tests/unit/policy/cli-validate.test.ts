// T078: Tests for toride validate CLI command

import { describe, it, expect, beforeAll, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("toride validate CLI", () => {
  let main: (args: string[]) => Promise<number>;
  const tmpDir = join(import.meta.dirname ?? __dirname, "__tmp_cli__");

  beforeAll(async () => {
    const mod = await import("../../../src/cli.js");
    main = mod.main;

    // Create temp directory for test files
    mkdirSync(tmpDir, { recursive: true });
  });

  function writeTmpFile(name: string, content: string): string {
    const path = join(tmpDir, name);
    writeFileSync(path, content, "utf-8");
    return path;
  }

  it("exits 0 for a valid YAML policy", async () => {
    const filePath = writeTmpFile(
      "valid.yaml",
      `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
`,
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await main(["validate", filePath]);
    expect(code).toBe(0);
    consoleSpy.mockRestore();
  });

  it("exits 1 for an invalid YAML policy", async () => {
    const filePath = writeTmpFile(
      "invalid.yaml",
      `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      manager: [read]
`,
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["validate", filePath]);
    expect(code).toBe(1);
    consoleSpy.mockRestore();
  });

  it("exits 0 for a valid JSON policy", async () => {
    const filePath = writeTmpFile(
      "valid.json",
      JSON.stringify({
        version: "1",
        actors: { User: { attributes: { email: "string" } } },
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
          },
        },
      }),
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await main(["validate", filePath]);
    expect(code).toBe(0);
    consoleSpy.mockRestore();
  });

  it("exits 1 for missing file", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["validate", "/nonexistent/policy.yaml"]);
    expect(code).toBe(1);
    consoleSpy.mockRestore();
  });

  it("exits 1 for no policy file specified", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["validate"]);
    expect(code).toBe(1);
    consoleSpy.mockRestore();
  });

  it("exits 1 for unknown command", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["unknown"]);
    expect(code).toBe(1);
    consoleSpy.mockRestore();
  });

  it("--strict shows warnings but exits 0 if no errors", async () => {
    const filePath = writeTmpFile(
      "with-warnings.yaml",
      `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer, commenter]
    permissions: [read]
    grants:
      viewer: [read]
`,
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await main(["validate", "--strict", filePath]);
    expect(code).toBe(0);
    // Should have printed a warning about unused "commenter" role
    expect(warnSpy).toHaveBeenCalled();
    const warningText = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warningText).toContain("commenter");
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("--strict exits 1 if there are errors even with warnings", async () => {
    const filePath = writeTmpFile(
      "strict-errors.yaml",
      `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer, commenter]
    permissions: [read]
    grants:
      viewer: [read]
      manager: [read]
`,
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const code = await main(["validate", "--strict", filePath]);
    expect(code).toBe(1);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Cleanup
  it("cleanup temp files", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
