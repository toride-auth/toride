import type { FC, PropsWithChildren } from "hono/jsx";

type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  isSuperAdmin: boolean;
};

type LayoutProps = PropsWithChildren<{
  currentUser: User;
  users: User[];
}>;

export const Layout: FC<LayoutProps> = ({ children, currentUser, users }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Toride + Prisma Example</title>
        <script src="https://unpkg.com/htmx.org@2.0.4" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
          header { background: #1a1a2e; color: #fff; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
          header h1 { font-size: 1.25rem; }
          .user-switcher { display: flex; align-items: center; gap: 0.5rem; }
          .user-switcher label { font-size: 0.875rem; color: #ccc; }
          .user-switcher select { padding: 0.375rem 0.75rem; border-radius: 4px; border: 1px solid #444; background: #16213e; color: #fff; font-size: 0.875rem; cursor: pointer; }
          main { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
          .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.25rem; margin-bottom: 1rem; }
          .card h2 { font-size: 1.125rem; margin-bottom: 0.5rem; }
          .card a { color: #1a1a2e; text-decoration: none; }
          .card a:hover { text-decoration: underline; }
          .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
          .badge-active { background: #d4edda; color: #155724; }
          .badge-completed { background: #f8d7da; color: #721c24; }
          .badge-archived { background: #e2e3e5; color: #383d41; }
          .badge-todo { background: #fff3cd; color: #856404; }
          .badge-in_progress { background: #cce5ff; color: #004085; }
          .badge-done { background: #d4edda; color: #155724; }
          .meta { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
          .task-list { list-style: none; }
          .task-item { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid #eee; }
          .task-item:last-child { border-bottom: none; }
          .task-info { flex: 1; }
          .task-actions { display: flex; gap: 0.5rem; }
          .btn { padding: 0.375rem 0.75rem; border-radius: 4px; border: 1px solid transparent; font-size: 0.875rem; cursor: pointer; text-decoration: none; display: inline-block; }
          .btn-primary { background: #1a1a2e; color: #fff; }
          .btn-primary:hover { background: #16213e; }
          .btn-danger { background: #dc3545; color: #fff; }
          .btn-danger:hover { background: #c82333; }
          .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
          .error { background: #f8d7da; color: #721c24; padding: 0.75rem; border-radius: 4px; margin-top: 0.5rem; }
          .empty { text-align: center; color: #888; padding: 2rem; }
          form.inline { display: inline; }
          .form-group { margin-bottom: 1rem; }
          .form-group label { display: block; font-size: 0.875rem; margin-bottom: 0.25rem; font-weight: 600; }
          .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.875rem; }
          .user-info { font-size: 0.75rem; color: #aaa; margin-top: 0.25rem; }
        `}</style>
      </head>
      <body>
        <header>
          <h1><a href="/projects" style="color: #fff; text-decoration: none;">Toride + Prisma Example</a></h1>
          <div class="user-switcher">
            <label>Current user:</label>
            <form>
              <select
                name="userId"
                hx-post="/switch-user"
                hx-trigger="change"
                hx-swap="none"
              >
                {users.map((user) => (
                  <option value={user.id} selected={user.id === currentUser.id}>
                    {user.name} ({user.department}{user.isSuperAdmin ? ", superadmin" : ""})
                  </option>
                ))}
              </select>
            </form>
          </div>
        </header>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
};
