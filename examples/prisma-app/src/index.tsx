import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { serve } from "@hono/node-server";
import { userMiddleware } from "./middleware.js";
import type { AppEnv } from "./types.js";
import projectRoutes from "./routes/projects.js";
import taskRoutes from "./routes/tasks.js";

const app = new Hono<AppEnv>();

// Apply user middleware to all routes
app.use("*", userMiddleware);

// Mount route modules
app.route("/projects", projectRoutes);
app.route("/", taskRoutes);

// Redirect root to project list
app.get("/", (c) => c.redirect("/projects"));

/**
 * POST /switch-user — Set the currentUser cookie and redirect.
 * The user switcher dropdown in the header POSTs here via HTMX.
 */
app.post("/switch-user", async (c) => {
  const body = await c.req.parseBody();
  const userId = typeof body.userId === "string" ? body.userId : "";

  if (userId) {
    setCookie(c, "currentUser", userId, { path: "/" });
  }

  c.header("HX-Redirect", "/projects");
  return c.body(null, 204);
});

// Start server
const port = 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Toride + Prisma example app running at http://localhost:${port}`);
});
