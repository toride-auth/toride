import type { FC } from "hono/jsx";

type TaskItemProps = {
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { name: string } | null;
  };
  permittedActions: string[];
};

const statusOptions = ["todo", "in_progress", "done"];

export const TaskItem: FC<TaskItemProps> = ({ task, permittedActions }) => {
  const canUpdate = permittedActions.includes("update");
  const canDelete = permittedActions.includes("delete");

  return (
    <li class="task-item" id={`task-${task.id}`}>
      <div class="task-info">
        <strong>{task.title}</strong>
        {" "}
        <span class={`badge badge-${task.status}`}>{task.status}</span>
        {task.assignee && (
          <span class="meta"> · Assigned to {task.assignee.name}</span>
        )}
      </div>
      <div class="task-actions">
        {canUpdate && (
          <form
            class="inline"
            hx-put={`/tasks/${task.id}`}
            hx-target={`#task-${task.id}`}
            hx-swap="outerHTML"
          >
            <input
              type="text"
              name="title"
              value={task.title}
              style="width: 120px; padding: 0.2rem 0.4rem; font-size: 0.75rem;"
            />
            <select
              name="status"
              style="padding: 0.2rem; font-size: 0.75rem;"
            >
              {statusOptions.map((s) => (
                <option value={s} selected={s === task.status}>
                  {s}
                </option>
              ))}
            </select>
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
          </form>
        )}
        {canDelete && (
          <form class="inline">
            <button
              type="button"
              class="btn btn-danger btn-sm"
              hx-delete={`/tasks/${task.id}`}
              hx-target={`#task-${task.id}`}
              hx-swap="outerHTML"
              hx-confirm="Delete this task?"
            >
              Delete
            </button>
          </form>
        )}
      </div>
      <div id={`task-${task.id}-error`} />
    </li>
  );
};
