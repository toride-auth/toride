/**
 * Contract: ForbiddenError class
 *
 * New error class exported from the toride package.
 * Callers can throw this when buildConstraints returns { ok: false }.
 */

import type { ActorRef } from "../../packages/toride/src/types.js";

/** Thrown when an actor is forbidden from performing an action on a resource type. */
export class ForbiddenError extends Error {
  readonly actor: ActorRef;
  readonly action: string;
  readonly resourceType: string;

  constructor(actor: ActorRef, action: string, resourceType: string) {
    super(
      `Actor "${actor.type}:${actor.id}" is forbidden from performing "${action}" on resource type "${resourceType}"`,
    );
    this.name = "ForbiddenError";
    this.actor = actor;
    this.action = action;
    this.resourceType = resourceType;
  }
}
