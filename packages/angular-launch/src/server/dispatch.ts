import { frameworkFailures, type FrameworkCode } from "../client.js";
import { serializeJson } from "../json.js";
import { inputIssues, type InputIssue } from "../input-issues.js";
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

/**
 * The application's RPC groups, keyed by namespace.
 *
 * @remarks
 * Internal; not exported from a public entry point. Generation writes it as
 * `registry` in `server.generated.ts`.
 */
export type Registry = Readonly<Record<string, Group<string, Record<string, ProcedureDefinition>>>>;

const scopeMarker = Symbol.for("@loozo/angular-launch/private-request-scope/v1");

/**
 * The application identity and context definition that requests are bound to.
 *
 * @remarks
 * Internal; not exported from a public entry point. Generation writes it as
 * `appBinding` in `server.generated.ts`.
 *
 * @typeParam Definition - The application's context definition.
 */
export interface ApplicationBinding<
  Definition extends ContextDefinition<unknown> = ContextDefinition<unknown>,
> {
  /** The generated application identity. */
  readonly id: string;
  /** The application's context definition. */
  readonly context: Definition;
}

const bindingHeader = "x-loozo-launch-scope";

/**
 * A live server request bound to the context created for it.
 *
 * @remarks
 * Created by the generated `createContext` in `server.generated.ts`.
 * Render a page by passing `scope.request` together with `scope` as Angular's request
 * context; RPC calls during that render fail with `INTERNAL` if the two don't belong
 * together.
 *
 * @typeParam Value - The context value.
 */
export interface RequestScope<Value = unknown> {
  /** The identity of the application the scope was created for. */
  readonly appId: string;
  /** A random identifier tying `request` to this scope. */
  readonly binding: string;
  /** A clone of the original request that carries the scope binding. */
  readonly request: Request;
  /** The awaited context value created for `request`. */
  readonly value: Value;
  /** Internal brand of genuine request scopes; not public API. */
  readonly [scopeMarker]: true;
}

/**
 * Checks whether a value has the shape of a {@link RequestScope}.
 *
 * @remarks
 * Internal; not exported from a public entry point. It doesn't check which application
 * or request the scope belongs to; Launch checks that separately before dispatching.
 *
 * @param value - The value to check.
 * @returns `true` for values carrying the request scope brand and fields.
 */
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

/**
 * Creates the context for a live server request and binds them into a
 * {@link RequestScope}.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `createContext` in `server.generated.ts`; call that instead.
 * The scope's `request` is a clone of `request` with an added
 * `x-loozo-launch-scope` header, so the original stays usable. The context factory
 * receives that clone.
 *
 * @typeParam Definition - The application's context definition.
 * @param application - The application binding.
 * @param request - The live server request.
 * @returns The request scope.
 * @throws Rejects with whatever the context factory throws or rejects with, or with a
 * `TypeError` when `request`'s body was already read and can't be cloned.
 */
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

/** The HTTP status and JSON body {@link dispatch} produces for one call. Internal. */
export interface Reply {
  /** The HTTP status: 200 for a result, otherwise the error's status. */
  readonly status: number;
  /** The result, or an `{ error: { code, message, data } }` frame. */
  readonly body: unknown;
}

export function failure(code: Exclude<FrameworkCode, "INVALID_INPUT">): Reply {
  const frame = frameworkFailures[code];

  return { status: frame.status, body: { error: { code, message: frame.message, data: null } } };
}

export function invalidInput(issues: readonly InputIssue[] = []): Reply {
  const frame = frameworkFailures.INVALID_INPUT;
  // Both transports publish the same strict JSON, as for declared error data.
  const data: unknown = JSON.parse(serializeJson({ issues }));

  return {
    status: frame.status,
    body: { error: { code: "INVALID_INPUT", message: frame.message, data } },
  };
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

/**
 * Runs one procedure call within a request scope and produces its reply.
 *
 * @remarks
 * The shared pipeline behind {@link handleRpc} and the server-rendering backend of
 * {@link provideLaunchServer}. Internal; not exported from a public entry point. It
 * never rejects: every failure becomes a framework failure reply, and
 * unexpected errors are logged on the server.
 *
 * In order: the scope must belong to `application` and `request` (`INTERNAL`); the
 * path must be `/_rpc/<namespace>/<procedure>` for a registered procedure
 * (`RPC_NOT_FOUND`); a mutation in `"rendering"` mode is refused (`FORBIDDEN`); the
 * envelope must be strict JSON (`INTERNAL` otherwise, such as for `{ input: undefined }`,
 * a cycle or an accessor); it must then be exactly `{ input }` (`INVALID_INPUT` with no
 * issues) with input that passes the schema (`INVALID_INPUT` with the schema's issues),
 * or `null` without one (`INVALID_INPUT` with no issues); the group's
 * guards and then the procedure's guards must return `true` (`FORBIDDEN`). The
 * handler's strict JSON result is returned with status 200, and its declared errors
 * with their status.
 *
 * @param registry - The application's RPC groups.
 * @param path - The request path.
 * @param envelope - The parsed request body.
 * @param scope - The request scope whose context the call receives.
 * @param application - The application binding the scope must belong to.
 * @param request - The request the scope must be bound to.
 * @param mode - `"http"` for browser requests (the default) or `"rendering"` for calls
 * made during server rendering.
 * @returns The reply to send.
 */
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

    const parts = /^\/_rpc\/([A-Za-z_][A-Za-z0-9_]*)\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(path);

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
      return invalidInput();
    }

    let input: unknown;

    if (procedure.input) {
      const parsed = await procedure.input["~standard"].validate(normalized.input);

      if (parsed.issues) {
        return invalidInput(inputIssues(parsed.issues));
      }

      input = parsed.value;
    } else if (normalized.input !== null) {
      return invalidInput();
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

/**
 * Answers an RPC HTTP request, or returns `null` for any other request.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `handleRequest` in `server.generated.ts`; call that instead.
 * Any path starting with `/_rpc/` is treated as an RPC request. It must be a `POST`
 * with an `application/json` content type and no query string, otherwise the reply is
 * `INVALID_INPUT` with no issues and no context is created. A fresh context is then
 * created before the body is parsed; if that fails the reply is `INTERNAL`, even when the
 * body isn't JSON. Otherwise a body that isn't JSON gives `INVALID_INPUT` with no issues.
 * Responses are JSON with `Cache-Control: private, no-store` and `Vary: Cookie`.
 *
 * @typeParam Definition - The application's context definition.
 * @param registry - The application's RPC groups.
 * @param application - The application binding.
 * @param request - The incoming server request.
 * @returns The RPC response, or `null` when the path doesn't start with `/_rpc/`.
 */
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
    reply = invalidInput();
  } else {
    try {
      const scope = await createRequestScope(application, request);
      let envelope: unknown;

      try {
        envelope = await request.json();
      } catch {
        return response(invalidInput());
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
