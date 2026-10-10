export function ownRecord(
  value: unknown,
  label: string,
  allowSymbols = false,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an own record`);
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} cannot contain inherited entries`);
  }

  for (const key of Reflect.ownKeys(value)) {
    if (
      (!allowSymbols && typeof key !== "string") ||
      !Object.prototype.propertyIsEnumerable.call(value, key)
    ) {
      throw new TypeError(`${label} contains an unsupported key`);
    }
  }

  return value as Record<string, unknown>;
}

export function checkKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new TypeError(`Unknown ${label} key: ${key}`);
    }
  }
}

export function has(record: object, key: PropertyKey): boolean {
  return Object.hasOwn(record, key);
}
