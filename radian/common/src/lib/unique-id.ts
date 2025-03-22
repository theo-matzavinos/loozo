const registry = new Map<string, number>();

/** Generates namespaced unique ids. */
export function uniqueId(key: string) {
  const nextId = (registry.get(key) ?? -1) + 1;

  registry.set(key, nextId);

  return `${key}-${nextId}`;
}
