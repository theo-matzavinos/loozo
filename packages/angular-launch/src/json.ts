// Structural DTO compatibility, without requiring interface index signatures.
// Keep the original inferred type; this shape is only a compile-time constraint.
/**
 * The strict JSON shape of `Value`: `never` wherever `Value` isn't strict JSON.
 *
 * @remarks
 * Procedure inputs, results and error data must satisfy it. Functions become `never`;
 * arrays and objects are checked element by element.
 *
 * @typeParam Value - The type to check.
 */
export type JsonShape<Value> = Value extends null | boolean | number | string
  ? Value
  : Value extends (...args: never[]) => unknown
    ? never
    : Value extends readonly (infer Element)[]
      ? readonly JsonShape<Element>[]
      : Value extends object
        ? {
            readonly [Key in keyof Value]-?: Key extends string | number
              ? JsonShape<Value[Key]>
              : never;
          }
        : never;

// Deliberately strict wire subset: no toJSON hooks, Date, undefined, holes,
// nonfinite numbers, symbols, cycles or custom prototypes on either transport.
export function serializeJson(value: unknown): string {
  const active = new Set<object>();

  function visit(current: unknown): void {
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      return;
    }

    if (typeof current === "number" && Number.isFinite(current)) {
      return;
    }

    if (typeof current !== "object" || current === null || active.has(current)) {
      throw new TypeError("RPC values must be strict JSON");
    }

    active.add(current);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) {
        throw new TypeError("RPC arrays must have a plain prototype");
      }

      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, index);

        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("RPC arrays require dense data properties");
        }

        visit(descriptor.value);
      }

      if (Reflect.ownKeys(current).length !== current.length + 1) {
        throw new TypeError("RPC arrays cannot have extra properties");
      }
    } else {
      if (
        Object.getPrototypeOf(current) !== Object.prototype &&
        Object.getPrototypeOf(current) !== null
      ) {
        throw new TypeError("RPC objects must have a plain prototype");
      }

      for (const key of Reflect.ownKeys(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key)!;

        if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("RPC objects require enumerable string data properties");
        }

        visit(descriptor.value);
      }
    }

    active.delete(current);
  }

  visit(value);

  return JSON.stringify(value);
}
