// T088: Construct a RelationResolver from a TestCase's roles, relations, and attributes maps

import type { ActorRef, ResourceRef, RelationResolver, TestCase } from "../types.js";

/**
 * Constructs a RelationResolver from test case mock data.
 * Uses "Type:id" format as keys for roles, relations, and attributes maps.
 * Global roles are never mocked -- they are derived from actor attributes by the engine.
 */
export function createMockResolver(testCase: TestCase): RelationResolver {
  const { roles, relations, attributes } = testCase;

  return {
    async getRoles(_actor: ActorRef, resource: ResourceRef): Promise<string[]> {
      if (!roles) return [];
      const key = `${resource.type}:${resource.id}`;
      return roles[key] ?? [];
    },

    async getRelated(
      resource: ResourceRef,
      relationName: string,
    ): Promise<ResourceRef | ResourceRef[]> {
      if (!relations) return [];
      const key = `${resource.type}:${resource.id}`;
      const resourceRelations = relations[key];
      if (!resourceRelations) return [];
      return resourceRelations[relationName] ?? [];
    },

    async getAttributes(ref: ResourceRef): Promise<Record<string, unknown>> {
      if (!attributes) return {};
      const key = `${ref.type}:${ref.id}`;
      return attributes[key] ?? {};
    },
  };
}
