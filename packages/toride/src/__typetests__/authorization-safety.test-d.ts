import { expectNotAssignable, expectType, expectAssignable } from "tsd";
import type { TorideSchema, ResourceResolver, ResourceRef, ConstraintAdapter, ActorRef } from "../index.js";
import { Toride } from "../index.js";
interface Schema extends TorideSchema {
  resources: "Document" | "Project";
  actions: "read";
  actorTypes: "User";
  permissionMap: { Document: "read"; Project: "read" };
  roleMap: { Document: "viewer"; Project: "viewer" };
  resourceAttributeMap: { Document: { title: string; count: number }; Project: { public: boolean } };
  actorAttributeMap: { User: { name: string } };
  relationMap: { Document: { project: "Project"; assignee: "User" }; Project: Record<string, never> };
}
declare const engine: Toride<Schema>;
declare const actor: ActorRef<Schema>;
declare const adapter: ConstraintAdapter<{ Document: { title?: string }; Project: { public?: boolean } }>;
expectAssignable<ResourceResolver<Schema, "Document">>(async () => ({ title: null, project: { type: "Project", id: "p1" }, assignee: { type: "User", id: "u1" } }));
expectAssignable<ResourceResolver<Schema, "Project">>(async () => ({ public: false }));
expectAssignable<ResourceResolver<Schema, "Document">>(async () => null);
expectNotAssignable<ResourceResolver<Schema, "Document">>(async () => ({ count: "wrong" }));
expectNotAssignable<ResourceResolver<Schema, "Document">>(async () => ({ project: { type: "User", id: "u1" } }));
expectNotAssignable<ResourceRef<Schema>>({ type: "Document", id: "d1", attributes: { public: true } } as const);
async () => {
  const result = await engine.buildConstraints(actor, "read", "Document");
  if (!result.ok || !result.constraint) return;
  expectType<{ title?: string }>(engine.translateConstraints(result.constraint, adapter));
  // @ts-expect-error A Document constraint cannot select Project output.
  engine.translateConstraints<"Project", { Document: { title?: string }; Project: { public?: boolean } }>(result.constraint, adapter);
};
