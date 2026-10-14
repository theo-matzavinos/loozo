import { frameworkFailures } from "../client.js";
import type { ErrorDefinition, ErrorDefinitions, ErrorFactories } from "./definitions.js";

// The map lives on the actual registered procedure, not in module/global state.
// A native SSR bundle may load this module twice; both copies read that same map.
export const declaredFailures = Symbol.for("@loozo/angular-launch/private-declared-failures/v1");

/**
 * An error a procedure's error factory created, as recorded on the procedure.
 *
 * @remarks
 * The server looks it up when a handler throws, to send the declared error. Application
 * code doesn't create or read it.
 */
export interface DeclaredFailure {
  /** The declared error code. */
  readonly code: string;
  /** The error's declaration. */
  readonly definition: ErrorDefinition;
  /** The data passed to the factory, before validation. */
  readonly data: unknown;
}

export function createErrors<Definitions extends ErrorDefinitions>(
  definitions: Definitions,
): {
  factories: ErrorFactories<Definitions>;
  failures: WeakMap<object, DeclaredFailure>;
} {
  const factories: Record<string, (data: unknown) => Error> = Object.create(null);
  const failures = new WeakMap<object, DeclaredFailure>();

  for (const [code, definition] of Object.entries(definitions)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(code) ||
      code === "__proto__" ||
      Object.hasOwn(frameworkFailures, code) ||
      !Number.isInteger(definition.status) ||
      definition.status < 400 ||
      definition.status > 599 ||
      typeof definition.message !== "string" ||
      definition.message.length === 0 ||
      !definition.data ||
      definition.data["~standard"]?.version !== 1 ||
      typeof definition.data["~standard"].vendor !== "string" ||
      typeof definition.data["~standard"].validate !== "function"
    ) {
      throw new TypeError(`Invalid declared RPC error: ${code}`);
    }

    factories[code] = (data) => {
      const error = new Error(definition.message);

      failures.set(error, { code, definition, data });

      return error;
    };
  }

  // Every key above closes over its own declaration; the generic mapping only
  // exposes that schema's input to TypeScript. Data is validated on dispatch.
  return { factories: factories as ErrorFactories<Definitions>, failures };
}
