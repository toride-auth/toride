import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear all data in reverse-dependency order for idempotency
  await prisma.$transaction([
    prisma.roleAssignment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Create users
  const alice = await prisma.user.create({
    data: {
      name: "Alice",
      email: "alice@example.com",
      department: "engineering",
      isSuperAdmin: false,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: "Bob",
      email: "bob@example.com",
      department: "engineering",
      isSuperAdmin: false,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      name: "Charlie",
      email: "charlie@example.com",
      department: "ops",
      isSuperAdmin: true,
    },
  });

  // Create projects
  const alpha = await prisma.project.create({
    data: {
      name: "Project Alpha",
      department: "engineering",
      status: "active",
      archived: false,
    },
  });

  const beta = await prisma.project.create({
    data: {
      name: "Project Beta",
      department: "marketing",
      status: "active",
      archived: false,
    },
  });

  const gamma = await prisma.project.create({
    data: {
      name: "Project Gamma",
      department: "engineering",
      status: "completed",
      archived: true,
    },
  });

  // Create role assignments
  await prisma.$transaction([
    prisma.roleAssignment.create({
      data: { userId: alice.id, projectId: alpha.id, role: "viewer" },
    }),
    prisma.roleAssignment.create({
      data: { userId: bob.id, projectId: alpha.id, role: "editor" },
    }),
    prisma.roleAssignment.create({
      data: { userId: bob.id, projectId: beta.id, role: "viewer" },
    }),
  ]);

  // Create tasks
  await prisma.$transaction([
    prisma.task.create({
      data: {
        title: "Set up CI pipeline",
        status: "todo",
        projectId: alpha.id,
        assigneeId: bob.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Write documentation",
        status: "in_progress",
        projectId: alpha.id,
        assigneeId: alice.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Design system architecture",
        status: "done",
        projectId: alpha.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Create marketing plan",
        status: "todo",
        projectId: beta.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Review Q3 budget",
        status: "in_progress",
        projectId: beta.id,
        assigneeId: bob.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Legacy cleanup",
        status: "todo",
        projectId: gamma.id,
        assigneeId: bob.id,
      },
    }),
  ]);

  console.log("Seed data created successfully:");
  console.log(`  Users: ${alice.name}, ${bob.name}, ${charlie.name}`);
  console.log(`  Projects: ${alpha.name}, ${beta.name}, ${gamma.name}`);
  console.log("  Role assignments: 3");
  console.log("  Tasks: 6");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
