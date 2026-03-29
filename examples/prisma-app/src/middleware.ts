import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { prisma } from "./db.js";
import type { User, AppEnv } from "./types.js";

/**
 * Middleware that resolves the current user from the `currentUser` cookie.
 * Falls back to the first user in the database if no cookie is set.
 * Returns 404 if no users exist (database not seeded).
 */
export const userMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = getCookie(c, "currentUser");

  // Load all users for the user switcher dropdown
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });

  if (allUsers.length === 0) {
    return c.text("No users found. Run 'pnpm prisma db seed' first.", 404);
  }

  let user: User | null = null;

  if (userId) {
    user = allUsers.find((u) => u.id === userId) ?? null;
  }

  // Fall back to first user if cookie is missing or invalid
  if (!user) {
    user = allUsers[0];
  }

  c.set("currentUser", user);
  c.set("allUsers", allUsers);
  await next();
});