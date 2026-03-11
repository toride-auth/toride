import type { FC } from "hono/jsx";

type ProjectWithActions = {
  id: string;
  name: string;
  department: string;
  status: string;
  permittedActions: string[];
};

type ProjectListProps = {
  projects: ProjectWithActions[];
};

export const ProjectList: FC<ProjectListProps> = ({ projects }) => {
  if (projects.length === 0) {
    return (
      <div class="empty">
        <p>No accessible projects. Your current role does not grant read access to any projects.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style="margin-bottom: 1rem;">Projects</h2>
      {projects.map((project) => (
        <div class="card" key={project.id}>
          <h2>
            <a href={`/projects/${project.id}`}>{project.name}</a>
          </h2>
          <div class="meta">
            Department: {project.department}
            {" · "}
            <span class={`badge badge-${project.status}`}>{project.status}</span>
          </div>
          {project.permittedActions.length > 0 && (
            <div class="meta" style="margin-top: 0.5rem;">
              Actions: {project.permittedActions.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
