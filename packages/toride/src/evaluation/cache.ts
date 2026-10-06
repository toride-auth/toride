import type { EvaluationDiagnostic, Policy, ResourceRef, ResourceBlock, Resolvers } from "../types.js";

const maxFastIdentityLength = 1024;

export class ObservationError extends Error {
  constructor(readonly code: EvaluationDiagnostic["code"], readonly path: string) {
    super(`${code}: ${path}`);
    this.name = "ObservationError";
  }
}
export function isResourceRef(value: unknown): value is ResourceRef {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string" && "id" in value && typeof value.id === "string";
}
export function sameObservation(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left), b = Object.keys(right);
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && sameObservation((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

export class AttributeCache {
  private readonly cache = new Map<string, Promise<Record<string, unknown> | null>>();
  private readonly observations = new Map<string, Record<string, unknown>>();
  readonly diagnostics: EvaluationDiagnostic[] = [];
  hasConflict = false;
  private readonly absent = new Set<string>();

  isAbsent(ref: ResourceRef): boolean {
    // Preserve identity getter reads before the empty-set shortcut.
    const type = ref.type;
    const id = ref.id;
    // Large escaped identities can exceed JSON's maximum string length.
    if (this.absent.size === 0 && typeof type === "string" && typeof id === "string" && type.length + id.length <= maxFastIdentityLength) return false;
    return this.absent.has(JSON.stringify([type, id]));
  }

  constructor(private readonly resolvers: Resolvers = {}, readonly policy?: Policy) {}

  report(code: EvaluationDiagnostic["code"], path: string): void {
    if (!this.diagnostics.some(item => item.code === code && item.path === path)) this.diagnostics.push({ code, path });
    if (code === "conflicting_observation") this.hasConflict = true;
  }

  async resolve(ref: ResourceRef, fallbackBlock?: ResourceBlock): Promise<Record<string, unknown> | null> {
    const key = JSON.stringify([ref.type, ref.id]);
    try {
      this.observe(ref);
      let result = this.cache.get(key);
      if (!result) {
        result = this.load(ref, this.policy?.resources[ref.type] ?? fallbackBlock);
        this.cache.set(key, result);
      }
      return await result;
    } catch (error) {
      const failure = error instanceof ObservationError ? error : new ObservationError("resolver_error", `${ref.type}:${ref.id}`);
      this.report(failure.code, failure.path);
      throw failure;
    }
  }

  private observe(ref: ResourceRef): void {
    const key = JSON.stringify([ref.type, ref.id]);
    const prior = this.observations.get(key) ?? {};
    const incoming = ref.attributes ?? {};
    for (const [field, value] of Object.entries(incoming)) {
      if ((Object.hasOwn(prior, field) && !sameObservation(prior[field], value)) || (this.cache.has(key) && !Object.hasOwn(prior, field))) {
        throw new ObservationError("conflicting_observation", `${ref.type}:${ref.id}.${field}`);
      }
    }
    this.observations.set(key, { ...prior, ...incoming });
  }

  private async load(ref: ResourceRef, block?: ResourceBlock): Promise<Record<string, unknown> | null> {
    const resolver = this.resolvers[ref.type];
    const data = resolver ? await resolver(ref) : {};
    if (data === null) {
      this.absent.add(JSON.stringify([ref.type, ref.id]));
      return null;
    }
    if (typeof data !== "object" || Array.isArray(data)) throw new ObservationError("resolver_error", `${ref.type}:${ref.id}`);
    const inline = this.observations.get(JSON.stringify([ref.type, ref.id])) ?? {};
    const merged = { ...data, ...inline };
    for (const [field, target] of Object.entries(block?.relations ?? {})) {
      const value = merged[field];
      if (value === null || value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      for (let i = 0; i < values.length; i++) {
        const child: unknown = values[i];
        if (!isResourceRef(child) || child.type !== target) throw new ObservationError("invalid_relation", `${ref.type}.${field}${Array.isArray(value) ? `[${i}]` : ""}`);
        const extra = Object.fromEntries(Object.entries(child).filter(([name]) => !["type", "id", "attributes"].includes(name)));
        const nested = { ...extra, ...child.attributes };
        if (Object.keys(nested).length) this.observe({ type: target, id: child.id, attributes: nested });
      }
    }
    return merged;
  }
}
