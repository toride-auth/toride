import type { ActorRef } from "toride";
import type { GeneratedSchema } from "./generated/policy.js";

export type AppSchema = GeneratedSchema;

export type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  isSuperAdmin: boolean;
};

export type AppEnv = {
  Variables: {
    currentUser: User;
    allUsers: User[];
  };
};

export function toActorRef(user: User): ActorRef<AppSchema> {
  return {
    type: "User",
    id: user.id,
    attributes: {
      id: user.id,
      email: user.email,
      department: user.department,
      isSuperAdmin: user.isSuperAdmin,
    },
  };
}