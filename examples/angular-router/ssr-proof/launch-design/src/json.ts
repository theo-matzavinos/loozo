// Strict JSON subset for this proof: no implicit Date conversion, nonfinite
// numbers, undefined, class instances, sparse arrays or cycles.
export function serializeJson(value: unknown): string {
  const ancestors = new Set<object>();

  function validate(current: unknown): void {
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      return;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError("RPC numbers must be finite");
      }

      return;
    }

    if (typeof current !== "object") {
      throw new TypeError("RPC values must be JSON-safe");
    }

    if (ancestors.has(current)) {
      throw new TypeError("RPC values cannot contain cycles");
    }

    ancestors.add(current);

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        if (!Object.hasOwn(current, index)) {
          throw new TypeError("RPC arrays cannot be sparse");
        }

        validate(current[index]);
      }
    } else {
      const prototype: unknown = Object.getPrototypeOf(current);

      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("RPC objects must be plain JSON data");
      }

      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === "symbol") {
          throw new TypeError("RPC objects cannot have symbol keys");
        }

        const descriptor = Object.getOwnPropertyDescriptor(current, key);

        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError("RPC objects must contain enumerable data properties");
        }

        validate(descriptor.value);
      }
    }

    ancestors.delete(current);
  }

  validate(value);

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError("RPC values must be JSON-safe");
  }

  return serialized;
}
