// T080: Unit tests for TorideClient

import { describe, it, expect } from "vitest";
import { TorideClient } from "./client.js";
import type { PermissionSnapshot } from "./snapshot.js";

describe("TorideClient", () => {
  const snapshot: PermissionSnapshot = {
    "Document:doc1": ["read", "update"],
    "Document:doc2": ["read"],
    "Project:p1": ["view", "edit", "archive"],
    "Task:t1": [],
  };

  it("returns true for permitted actions", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("read", { type: "Document", id: "doc1" })).toBe(true);
    expect(client.can("update", { type: "Document", id: "doc1" })).toBe(true);
  });

  it("returns false for non-permitted actions", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("delete", { type: "Document", id: "doc1" })).toBe(false);
  });

  it("returns false for unknown resources (default-deny)", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("read", { type: "Unknown", id: "x1" })).toBe(false);
  });

  it("returns false for resource with empty permissions", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("read", { type: "Task", id: "t1" })).toBe(false);
  });

  it("returns true for all permitted actions on a resource", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("view", { type: "Project", id: "p1" })).toBe(true);
    expect(client.can("edit", { type: "Project", id: "p1" })).toBe(true);
    expect(client.can("archive", { type: "Project", id: "p1" })).toBe(true);
  });

  it("returns false for non-permitted actions on a resource", () => {
    const client = new TorideClient(snapshot);
    expect(client.can("delete", { type: "Project", id: "p1" })).toBe(false);
  });

  it("can() is synchronous", () => {
    const client = new TorideClient(snapshot);
    // Verify can() returns a boolean (not a Promise)
    const result = client.can("read", { type: "Document", id: "doc1" });
    expect(typeof result).toBe("boolean");
    // Ensure it's not a thenable
    expect(result).not.toHaveProperty("then");
  });

  it("snapshot is immutable - modifications don't affect client", () => {
    const mutableSnapshot: PermissionSnapshot = {
      "Document:doc1": ["read"],
    };
    const client = new TorideClient(mutableSnapshot);

    // Mutate the original snapshot
    mutableSnapshot["Document:doc1"] = ["read", "update", "delete"];
    mutableSnapshot["Document:doc2"] = ["read"];

    // Client should still use original values
    expect(client.can("read", { type: "Document", id: "doc1" })).toBe(true);
    expect(client.can("update", { type: "Document", id: "doc1" })).toBe(false);
    expect(client.can("read", { type: "Document", id: "doc2" })).toBe(false);
  });

  it("handles empty snapshot", () => {
    const client = new TorideClient({});
    expect(client.can("read", { type: "Document", id: "doc1" })).toBe(false);
  });

  it("permittedActions returns actions for known resource", () => {
    const client = new TorideClient(snapshot);
    expect(client.permittedActions({ type: "Document", id: "doc1" })).toEqual([
      "read",
      "update",
    ]);
  });

  it("permittedActions returns empty array for unknown resource", () => {
    const client = new TorideClient(snapshot);
    expect(
      client.permittedActions({ type: "Unknown", id: "x1" }),
    ).toEqual([]);
  });
});
