import { frameworkFailures, type FrameworkCode } from "../client.js";
import { serializeJson } from "../json.js";
import type {
  Context,
  ContextDefinition,
  ContextOf,
  Group,
  ProcedureDefinition,
  ErrorDefinitions,
  Schema,
} from "./definitions.js";

import { declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";

export type Registry = Readonly<Record<string, Group<string, Record<string, ProcedureDefinition>>>>;

const scopeMarker = Symbol.for("@loozo/angular-launch/private-request-scope/v1");

export interface ApplicationBinding<
  Definition extends ContextDefinition<unknown> = ContextDefinition<unknown>,
> {
  readonly id: string;
  readonly context: Definition;
}

const bindingHeader = "x-loozo-launch-scope";

export interface RequestScope<Value = unknown> {
  readonly appId: string;
  readonly binding: string;
  readonly request: Request;
  readonly value: Value;
  readonly [scopeMarker]: true;
}

export function isRequestScope(value: unknown): value is RequestScope {
  return (
    typeof value === "object" &&
    value !== null &&
    scopeMarker in value &&
    value[scopeMarker] === true &&
    "request" in value &&
    value.request instanceof Request &&
    "appId" in value &&
    typeof value.appId === "string" &&
    "binding" in value &&
    typeof value.binding === "string" &&
    "value" in value
  );
}

export async function createRequestScope<Definition extends ContextDefinition<unknown>>(
  application: ApplicationBinding<Definition>,
  request: Request,
): Promise<RequestScope<ContextOf<Definition>>> {
  const binding = crypto.randomUUID();
  const headers = new Headers(request.headers);

  headers.set(bindingHeader, binding);

  // Keep the caller's body usable and its signal linked via native Request clones.
  const boundRequest = new Request(request.clone(), { headers });
  const value = await application.context.create(boundRequest);

  return {
    appId: application.id,
    binding,
    request: boundRequest,
    value: value as ContextOf<Definition>,
    [scopeMarker]: true,
  };
}

export function assertBoundScope(
  scope: unknown,
  application: ApplicationBinding,
  request: Request,
): asserts scope is RequestScope {
  if (
    !isRequestScope(scope) ||
    scope.appId !== application.id ||
    scope.binding.length === 0 ||
    scope.request.headers.get(bindingHeader) !== scope.binding ||
    request.headers.get(bindingHeader) !== scope.binding
  ) {
    throw new Error("Launch request/application scope binding mismatch");
  }
}

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

export function failure(code: FrameworkCode): Reply {
  const frame = frameworkFailures[code];

  return { status: frame.status, body: { error: { code, message: frame.message, data: null } } };
}

export function isJsonMediaType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

interface RuntimeProcedure extends ProcedureDefinition {
  readonly input: Schema | undefined;
  readonly errors: ErrorDefinitions;
  readonly [declaredFailures]?: WeakMap<object, DeclaredFailure>;
  readonly canActivate: readonly ((args: {
    context: Context;
    request: Request;
    input: unknown;
  }) => boolean | Promise<boolean>)[];
  readonly handler: (args: { context: Context; input: unknown }) => unknown;
}

export async function dispatch(
  registry: Registry,
  path: string,
  envelope: unknown,
  scope: RequestScope,
  application: ApplicationBinding,
  request: Request,
  mode: "http" | "rendering" = "http",
): Promise<Reply> {
  try {
    assertBoundScope(scope, application, request);

    const parts = /^\/_rpc\/([a-f0-9]{24})\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(path);

    if (!parts || !Object.hasOwn(registry, parts[1])) {
      return failure("RPC_NOT_FOUND");
    }

    const group = registry[parts[1]];

    if (!Object.hasOwn(group.procedures, parts[2])) {
      return failure("RPC_NOT_FOUND");
    }

    const procedure = group.procedures[parts[2]] as RuntimeProcedure;

    if (procedure.kind !== "query" && procedure.kind !== "mutation") {
      throw new Error("Launch registry contains an unsupported procedure");
    }

    // Rendering never performs writes, even for unmarked HttpClient calls or
    // callers/interceptors that relabel a generated method or enable caching.
    if (mode === "rendering" && procedure.kind === "mutation") {
      return failure("FORBIDDEN");
    }

    // Even direct transport crosses the exact same strict JSON boundary.
    const normalized: unknown = JSON.parse(serializeJson(envelope));

    if (
      typeof normalized !== "object" ||
      normalized === null ||
      Array.isArray(normalized) ||
      !("input" in normalized) ||
      Object.keys(normalized).length !== 1
    ) {
      return failure("INVALID_INPUT");
    }

    let input: unknown;

    if (procedure.input) {
      const parsed = await procedure.input["~standard"].validate(normalized.input);

      if (parsed.issues) {
        return failure("INVALID_INPUT");
      }

      input = parsed.value;
    } else if (normalized.input !== null) {
      return failure("INVALID_INPUT");
    }

    const context = scope.value as Context;

    for (const guard of group.canActivate) {
      if (!(await guard({ context, request }))) {
        return failure("FORBIDDEN");
      }
    }

    for (const guard of procedure.canActivate) {
      if (!(await guard({ context, request, input }))) {
        return failure("FORBIDDEN");
      }
    }

    let output: unknown;

    try {
      output = await procedure.handler({ context, input });
    } catch (error) {
      let declared: DeclaredFailure | undefined;

      if (typeof error === "object" && error !== null) {
        declared = procedure[declaredFailures]?.get(error);
      }

      if (!declared || !Object.hasOwn(procedure.errors, declared.code)) {
        throw error;
      }

      const definition = procedure.errors[declared.code];

      if (definition !== declared.definition) {
        throw error;
      }

      const parsed = await definition.data["~standard"].validate(declared.data);

      if (parsed.issues) {
        throw new Error("Declared RPC error data failed validation", { cause: error });
      }

      const data: unknown = JSON.parse(serializeJson(parsed.value));

      return {
        status: definition.status,
        body: { error: { code: declared.code, message: definition.message, data } },
      };
    }

    return { status: 200, body: JSON.parse(serializeJson(output)) };
  } catch (error) {
    console.error("Launch RPC failed", error);

    return failure("INTERNAL");
  }
}

export async function handleRpc<Definition extends ContextDefinition<unknown>>(
  registry: Registry,
  application: ApplicationBinding<Definition>,
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/_rpc/")) {
    return null;
  }

  let reply: Reply;

  if (
    request.method !== "POST" ||
    !isJsonMediaType(request.headers.get("content-type")) ||
    url.search !== ""
  ) {
    reply = failure("INVALID_INPUT");
  } else {
    try {
      const scope = await createRequestScope(application, request);
      let envelope: unknown;

      try {
        envelope = await request.json();
      } catch {
        return response(failure("INVALID_INPUT"));
      }

      reply = await dispatch(registry, url.pathname, envelope, scope, application, scope.request);
    } catch (error) {
      console.error("Launch context failed", error);
      reply = failure("INTERNAL");
    }
  }

  return response(reply);
}

function response(reply: Reply): Response {
  return new Response(serializeJson(reply.body), {
    status: reply.status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
