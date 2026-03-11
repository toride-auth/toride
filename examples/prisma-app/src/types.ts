import type { ActorRef } from "toride";

export type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  isSuperAdmin: boolean;
};

/** Hono environment type shared across all route modules. */
export type AppEnv = {
  Variables: {
    currentUser: User;
    allUsers: User[];
  };
};

/** Convert a User to an ActorRef for the toride engine. */
export function toActorRef(user: User): ActorRef {
  return {
    type: "User",
    id: user.id,
    attributes: {
      email: user.email,
      department: user.department,
      isSuperAdmin: user.isSuperAdmin,
    },
  };
}
