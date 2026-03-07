/**
 * Shared benchmark setup helper.
 *
 * Loads YAML policy fixtures by tier name, creates Toride engine instances
 * with tier-appropriate mock resolvers, and provides pre-built test data
 * objects for all 9 benchmarkable operations.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadYaml, createToride } from "../../src/index.js";
import type {
  Policy,
  ActorRef,
  ResourceRef,
  BatchCheckItem,
  Resolvers,
} from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Tier type ───────────────────────────────────────────────────

export type Tier = "small" | "medium" | "large";

// ─── Fixture loading ─────────────────────────────────────────────

const fixtureCache = new Map<Tier, Policy>();

/**
 * Load a YAML policy fixture by tier name.
 * Results are cached so repeated calls in the same process are free.
 */
export async function loadFixture(tier: Tier): Promise<Policy> {
  const cached = fixtureCache.get(tier);
  if (cached) return cached;

  const fixturePath = resolve(__dirname, "..", "fixtures", `${tier}.yaml`);
  const yaml = await readFile(fixturePath, "utf-8");
  const policy = await loadYaml(yaml);
  fixtureCache.set(tier, policy);
  return policy;
}

// ─── Mock resolvers per tier ─────────────────────────────────────

/**
 * Build mock resolvers that return immediately with tier-appropriate
 * attribute data. Synchronous-like async to isolate engine perf from I/O.
 */
function buildResolvers(tier: Tier): Resolvers {
  switch (tier) {
    case "small":
      // Small tier: no relations, no conditions on resources.
      // Return empty attributes.
      return {};

    case "medium":
      return {
        Document: async () => ({
          status: "review",
          locked: false,
          archived: false,
        }),
        DocumentVersion: async () => ({
          document: { type: "Document", id: "doc1" },
        }),
        Comment: async () => ({
          document: { type: "Document", id: "doc1" },
        }),
        Attachment: async () => ({
          document: { type: "Document", id: "doc1" },
        }),
        Project: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        Milestone: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Task: async () => ({
          project: { type: "Project", id: "proj1" },
          assignee: { type: "User", id: "u1" },
          status: "open",
        }),
        Label: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Organization: async () => ({
          protected: false,
        }),
        Team: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        Invoice: async () => ({
          org: { type: "Organization", id: "org1" },
          paid: false,
        }),
        Subscription: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        PaymentMethod: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        BillingContact: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        CreditNote: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
      };

    case "large":
      return {
        Organization: async () => ({
          protected: false,
          suspended: false,
        }),
        Department: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        Team: async () => ({
          department: { type: "Department", id: "dept1" },
          org: { type: "Organization", id: "org1" },
          archived: false,
        }),
        Project: async () => ({
          org: { type: "Organization", id: "org1" },
          team: { type: "Team", id: "team1" },
          status: "staging",
          freeze: false,
        }),
        Sprint: async () => ({
          project: { type: "Project", id: "proj1" },
          completed: false,
        }),
        Epic: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Story: async () => ({
          project: { type: "Project", id: "proj1" },
          assignee: { type: "User", id: "u1" },
          status: "in_progress",
        }),
        Task: async () => ({
          project: { type: "Project", id: "proj1" },
          assignee: { type: "User", id: "u1" },
          closed: false,
        }),
        Bug: async () => ({
          project: { type: "Project", id: "proj1" },
          assignee: { type: "User", id: "u1" },
          severity: "medium",
        }),
        Label: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Milestone: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Release: async () => ({
          project: { type: "Project", id: "proj1" },
          immutable: false,
        }),
        Document: async () => ({
          project: { type: "Project", id: "proj1" },
          author: { type: "User", id: "u1" },
          status: "review",
          locked: false,
          archived: false,
        }),
        WikiPage: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        KnowledgeArticle: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Comment: async () => ({
          document: { type: "Document", id: "doc1" },
        }),
        Attachment: async () => ({
          document: { type: "Document", id: "doc1" },
        }),
        UserGroup: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        ApiKey: async () => ({
          system_key: false,
        }),
        Invoice: async () => ({
          org: { type: "Organization", id: "org1" },
          paid: false,
          age_days: 30,
        }),
        Subscription: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        PaymentMethod: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        BillingContact: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        CreditNote: async () => ({
          org: { type: "Organization", id: "org1" },
          applied: false,
        }),
        TaxRecord: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        Pipeline: async () => ({
          project: { type: "Project", id: "proj1" },
          disabled: false,
        }),
        Build: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        Deployment: async () => ({
          project: { type: "Project", id: "proj1" },
          environment: "staging",
        }),
        Environment: async () => ({
          project: { type: "Project", id: "proj1" },
          production: false,
        }),
        Secret: async () => ({
          project: { type: "Project", id: "proj1" },
          system: false,
        }),
        Channel: async () => ({
          team: { type: "Team", id: "team1" },
          read_only: false,
        }),
        Message: async () => ({
          channel: { type: "Channel", id: "ch1" },
        }),
        Thread: async () => ({
          channel: { type: "Channel", id: "ch1" },
        }),
        Webhook: async () => ({
          project: { type: "Project", id: "proj1" },
        }),
        AuditLog: async () => ({
          org: { type: "Organization", id: "org1" },
          retention_required: true,
        }),
        CompliancePolicy: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        DataRetentionRule: async () => ({
          org: { type: "Organization", id: "org1" },
          active: true,
        }),
        ConsentRecord: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        DataExportRequest: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        IncidentReport: async () => ({
          org: { type: "Organization", id: "org1" },
          severity: "high",
          open_actions: 2,
        }),
        VulnerabilityReport: async () => ({
          org: { type: "Organization", id: "org1" },
          status: "open",
        }),
        SecurityPolicy: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
        AccessReview: async () => ({
          org: { type: "Organization", id: "org1" },
        }),
      };
  }
}

// ─── Pre-built test data per tier ────────────────────────────────

interface TierTestData {
  /** Actor with permissions (has roles that grant access) */
  actor: ActorRef;
  /** Primary resource to test against */
  resource: ResourceRef;
  /** Action that should be permitted for the actor */
  action: string;
  /** Resource type string for buildConstraints */
  resourceType: string;
  /** Batch check items for canBatch */
  batchChecks: BatchCheckItem[];
  /** Resources array for snapshot */
  resources: ResourceRef[];
  /** Field name for canField (must exist in field_access) */
  field: string;
  /** Field operation for canField/permittedFields */
  fieldOperation: "read" | "update";
  /** Env context for operations that use it */
  env: Record<string, unknown>;
}

function buildTestData(tier: Tier, policy: Policy): TierTestData {
  switch (tier) {
    case "small":
      return {
        actor: { type: "User", id: "u1", attributes: { is_editor: true } },
        resource: { type: "Document", id: "doc1" },
        action: "write",
        resourceType: "Document",
        batchChecks: [
          { action: "read", resource: { type: "Document", id: "doc1" } },
          { action: "write", resource: { type: "Document", id: "doc1" } },
          { action: "read", resource: { type: "Comment", id: "c1" } },
          { action: "create", resource: { type: "Tag", id: "t1" } },
          { action: "read", resource: { type: "Category", id: "cat1" } },
        ],
        resources: [
          { type: "Document", id: "doc1" },
          { type: "Comment", id: "c1" },
          { type: "Tag", id: "t1" },
          { type: "Category", id: "cat1" },
          { type: "Attachment", id: "a1" },
        ],
        field: "title",
        fieldOperation: "read",
        env: {},
      };

    case "medium":
      return {
        actor: {
          type: "User",
          id: "u1",
          attributes: {
            department: "content",
            level: 5,
            active: true,
            is_superadmin: false,
          },
        },
        resource: { type: "Document", id: "doc1" },
        action: "write",
        resourceType: "Document",
        batchChecks: [
          { action: "read", resource: { type: "Document", id: "doc1" } },
          { action: "write", resource: { type: "Document", id: "doc1" } },
          { action: "publish", resource: { type: "Document", id: "doc1" } },
          { action: "read", resource: { type: "Project", id: "proj1" } },
          { action: "read", resource: { type: "Task", id: "task1" } },
          { action: "update", resource: { type: "Task", id: "task1" } },
          { action: "read", resource: { type: "Invoice", id: "inv1" } },
          { action: "read", resource: { type: "User", id: "u2" } },
        ],
        resources: [
          { type: "Document", id: "doc1" },
          { type: "Project", id: "proj1" },
          { type: "Task", id: "task1" },
          { type: "Organization", id: "org1" },
          { type: "Invoice", id: "inv1" },
        ],
        field: "title",
        fieldOperation: "read",
        env: {},
      };

    case "large":
      return {
        actor: {
          type: "User",
          id: "u1",
          attributes: {
            department: "engineering",
            level: 7,
            active: true,
            is_superadmin: false,
            clearance: "confidential",
            region: "us-west",
            team: "platform",
          },
        },
        resource: { type: "Document", id: "doc1" },
        action: "write",
        resourceType: "Document",
        batchChecks: [
          { action: "read", resource: { type: "Document", id: "doc1" } },
          { action: "write", resource: { type: "Document", id: "doc1" } },
          { action: "read", resource: { type: "Project", id: "proj1" } },
          { action: "read", resource: { type: "Task", id: "task1" } },
          { action: "update", resource: { type: "Task", id: "task1" } },
          { action: "read", resource: { type: "Pipeline", id: "pipe1" } },
          { action: "trigger", resource: { type: "Pipeline", id: "pipe1" } },
          { action: "read", resource: { type: "Invoice", id: "inv1" } },
          { action: "read", resource: { type: "AuditLog", id: "log1" } },
          { action: "read", resource: { type: "Bug", id: "bug1" } },
        ],
        resources: [
          { type: "Document", id: "doc1" },
          { type: "Project", id: "proj1" },
          { type: "Task", id: "task1" },
          { type: "Organization", id: "org1" },
          { type: "Pipeline", id: "pipe1" },
          { type: "Invoice", id: "inv1" },
          { type: "AuditLog", id: "log1" },
          { type: "Bug", id: "bug1" },
        ],
        field: "title",
        fieldOperation: "read",
        env: { release_window: true },
      };
  }
}

// ─── Engine creation ─────────────────────────────────────────────

export interface BenchEngine {
  engine: ReturnType<typeof createToride>;
  testData: TierTestData;
  policy: Policy;
}

/**
 * Create a fully configured benchmark engine for a given tier.
 * Returns the engine, pre-built test data, and the loaded policy.
 */
export async function createBenchEngine(tier: Tier): Promise<BenchEngine> {
  const policy = await loadFixture(tier);
  const resolvers = buildResolvers(tier);
  const engine = createToride({ policy, resolvers });
  const testData = buildTestData(tier, policy);

  return { engine, testData, policy };
}
