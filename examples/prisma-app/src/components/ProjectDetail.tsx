import type { FC, PropsWithChildren } from "hono/jsx";

type ProjectDetailProps = PropsWithChildren<{
  project: {
    id: string;
    name: string;
    department: string;
    status: string;
  };
  permittedActions: string[];
}>;

export const ProjectDetail: FC<ProjectDetailProps> = ({
  project,
  permittedActions,
  children,
}) => {
  const canCreateTask = permittedActions.includes("create_task");

  return (
    <div>
      <div class="card">
        <h2>{project.name}</h2>
        <div class="meta">
          Department: {project.department}
          {" · "}
          <span class={`badge badge-${project.status}`}>{project.status}</span>
        </div>
        {permittedActions.length > 0 && (
          <div class="meta" style="margin-top: 0.5rem;">
            Your permissions: {permittedActions.join(", ")}
          </div>
        )}
      </div>

      {canCreateTask && (
        <div class="card">
          <h2>Create Task</h2>
          <form
            hx-post={`/projects/${project.id}/tasks`}
            hx-target="#task-list"
            hx-swap="beforeend"
            hx-on--after-request="if(event.detail.successful) this.reset()"
          >
            <div class="form-group">
              <label>Title</label>
              <input type="text" name="title" required />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" rows={2} />
            </div>
            <button type="submit" class="btn btn-primary">Add Task</button>
          </form>
        </div>
      )}

      <div class="card">
        <h2>Tasks</h2>
        <ul class="task-list" id="task-list">
          {children}
        </ul>
      </div>
    </div>
  );
};
