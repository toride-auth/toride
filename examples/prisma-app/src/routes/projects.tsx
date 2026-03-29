import { Hono } from "hono";
import { TorideClient } from "toride";
import { prisma } from "../db.js";
import { engine, adapter } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv, AppSchema } from "../types.js";
import { Layout } from "../components/Layout.js";
import { ProjectList } from "../components/ProjectList.js";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// PATTERN: Authorization-filtered list queries with buildConstraints()
//
// For list pages, we push authorization filtering down to the database so we
// only fetch rows the user is allowed to see. buildConstraints() produces an
// abstract constraint AST (or "unrestricted"/"forbidden" signals) based on
// the policy. translateConstraints() converts the AST into a Prisma WHERE
// clause via the adapter.
//
// This replaces the manual superadmin check + hand-built WHERE clause with
// a single, policy-driven query filter that stays in sync with policy.yaml.
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);

  type ProjectRow = {
    id: string;
    name: string;
    department: string;
    status: string;
    archived: boolean;
  };
  let projects: ProjectRow[] = [];

  // ---------------------------------------------------------------------------
  // Step 1: Use buildConstraints() to determine the actor's access level.
  //
  // buildConstraints() evaluates the policy for the given actor+action+resource
  // type and returns a ConstraintResult<"Project"> discriminated union:
  //   - { unrestricted: true }  → actor can read all resources of this type
  //   - { forbidden: true }     → actor cannot read any resources
  //   - { constraints: ... }    → partial access, pass to translateConstraints()
  //
  // translateConstraints() accepts the narrowed ConstraintResult directly and
  // converts the constraint AST into a Prisma WHERE clause via the adapter.
  // ---------------------------------------------------------------------------
  const result = await engine.buildConstraints(actor, "read", "Project");

  if ("forbidden" in result) {
    projects = [];
  } else if ("unrestricted" in result) {
    projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  } else {
    const where = engine.translateConstraints(result, adapter);
    projects = await prisma.project.findMany({ where, orderBy: { name: "asc" } });
  }

  // ---------------------------------------------------------------------------
  // PATTERN: snapshot() + TorideClient for batched permission checks
  //
  // Instead of calling permittedActions() per resource in a loop, snapshot()
  // batches all calls and returns a PermissionSnapshot map. TorideClient wraps
  // the snapshot for synchronous lookups with full type safety.
  //
  // This is more efficient for list views and demonstrates the snapshot/client
  // pattern intended for server-to-client permission transport.
  // ---------------------------------------------------------------------------
  const snap = await engine.snapshot(
    actor,
    projects.map((p) => ({ type: "Project" as const, id: p.id })),
  );
  const client = new TorideClient<AppSchema>(snap);

  const projectsWithActions = projects.map((project) => ({
    ...project,
    permittedActions: client.permittedActions({ type: "Project", id: project.id }),
  }));

  return c.html(
    <Layout currentUser={user} users={allUsers}>
      <ProjectList projects={projectsWithActions} />
    </Layout>,
  );
});

export default app;