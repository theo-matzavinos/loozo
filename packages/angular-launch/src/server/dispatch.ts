import { frameworkFailures, type FrameworkCode } from "../client.js";
import { serializeJson } from "../json.js";
import { inputIssues, type InputIssue } from "../input-issues.js";
import type {
  ContextDefinition,
  ContextOf,
  Group,
  ProcedureDefinition,
  ErrorDefinitions,
  Schema,
} from "./definitions.js";

import { declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";
import { eventStream, type StreamStart } from "./event-stream.js";
import { outcomeOf } from "./outcomes.js";

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
  readonly use: readonly ChainMiddleware[];
  readonly [declaredFailures]?: WeakMap<object, DeclaredFailure>;
  readonly handler: (args: object) => unknown;
}

// The runtime view of a middleware; `runChain` checks what `run` returns.
interface ChainMiddleware {
  readonly run: (args: never) => Promise<unknown>;
}

interface ChainArgs {
  readonly input: unknown;
  readonly request: Request;
  readonly signal: AbortSignal;
}

/**
 * Runs `chain` in order around `last`, passing each middleware the context the previous
 * one continued with.
 *
 * @remarks
 * Rejects when a middleware throws, calls `next` twice (whether it then returns or
 * throws) or returns anything other than its `next` result. A misused `next` never causes
 * an unhandled rejection: each promise it returns is observed here. When the rest of the
 * call a middleware started fails, that failure is logged unless the middleware rejected
 * with that same value, as an awaited rethrow does: the middleware may have left it
 * detached, or replaced it with another error such as `forbidden()`.
 */
async function runChain(
  chain: readonly ChainMiddleware[],
  context: unknown,
  args: ChainArgs,
  last: (context: unknown) => Promise<void>,
): Promise<void> {
  async function step(index: number, current: unknown): Promise<void> {
    if (index === chain.length) {
      await last(current);

      return;
    }

    const token = {};
    let calls = 0;
    let rest: Promise<object> | undefined;

    function next(added?: object): Promise<object> {
      calls += 1;

      let continued: Promise<object>;

      if (calls > 1) {
        continued = Promise.reject(new Error("Launch middleware called next() more than once"));
      } else {
        let merged = current;

        if (added !== undefined) {
          merged = { ...(current as object), ...added };
        }

        continued = step(index + 1, merged).then(() => token);
        rest = continued;
      }

      // A middleware that doesn't await this promise can't leave its rejection unhandled;
      // one that awaits it still sees the rejection.
      continued.catch(() => undefined);

      return continued;
    }

    const run = chain[index].run as (args: object) => Promise<unknown>;
    let returned: unknown;
    let thrown: { readonly error: unknown } | undefined;

    try {
      returned = await run({ ...args, context: current, next });
    } catch (error) {
      thrown = { error };
    }

    // Whether it already failed or fails later, a failure the middleware didn't rethrow
    // reaches nothing else.
    rest?.catch((error: unknown) => {
      if (thrown === undefined || error !== thrown.error) {
        console.error(
          "Launch RPC failed inside next(), and its middleware didn't rethrow it",
          error,
        );
      }
    });

    if (calls > 1 || (thrown === undefined && returned !== token)) {
      throw new Error(
        "Launch middleware must call next() once and return its result",
        thrown === undefined ? undefined : { cause: thrown.error },
      );
    }

    if (thrown !== undefined) {
      throw thrown.error;
    }
  }

  await step(0, context);
}

async function declaredReply(procedure: RuntimeProcedure, error: unknown): Promise<Reply> {
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
 * (`RPC_NOT_FOUND`); a mutation or stream in `"rendering"` mode is refused (`FORBIDDEN`); the
 * envelope must be strict JSON (`INTERNAL` otherwise, such as for `{ input: undefined }`,
 * a cycle or an accessor), and exactly `{ input }` (`INVALID_INPUT` with no issues);
 * the group's middleware runs with no input; the input must pass the schema
 * (`INVALID_INPUT` with the schema's issues), or be `null` without one (`INVALID_INPUT`
 * with no issues); the procedure's middleware runs with the validated input; then the
 * handler. The handler's strict JSON result is returned with status 200, and its
 * declared errors with their status. `forbidden()` thrown from middleware or the
 * handler gives `FORBIDDEN`; a middleware that calls `next` twice or doesn't return its
 * result gives `INTERNAL`.
 *
 * A stream's handler returns an iterable instead of a result. Its iterator goes to
 * `start`, and the call goes on until the stream ends: the reply is then a 200 with
 * `null` body, or the failure the stream ended with. Without `start`, a stream fails
 * with `INTERNAL`.
 *
 * @param registry - The application's RPC groups.
 * @param path - The request path.
 * @param envelope - The parsed request body.
 * @param scope - The request scope whose context the call receives.
 * @param application - The application binding the scope must belong to.
 * @param request - The request the scope must be bound to.
 * @param mode - `"http"` for browser requests (the default) or `"rendering"` for calls
 * made during server rendering.
 * @param signal - The call's abort signal. Defaults to `request`'s signal.
 * @param start - Receives a stream's iterator once its handler returned it.
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
  signal: AbortSignal = request.signal,
  start?: (stream: StreamStart) => void,
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

    if (
      procedure.kind !== "query" &&
      procedure.kind !== "mutation" &&
      procedure.kind !== "stream"
    ) {
      throw new Error("Launch registry contains an unsupported procedure");
    }

    // Rendering never performs writes, even for unmarked HttpClient calls or
    // callers/interceptors that relabel a generated method or enable caching. Streams
    // don't finish, so they don't run during rendering either.
    if (mode === "rendering" && procedure.kind !== "query") {
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

    let reply: Reply | undefined;

    try {
      // Group middleware runs before validation, so it never sees the raw input.
      await runChain(
        group.use,
        scope.value,
        { input: undefined, request, signal },
        async (groupContext) => {
          let input: unknown;

          if (procedure.input) {
            const parsed = await procedure.input["~standard"].validate(normalized.input);

            if (parsed.issues) {
              reply = invalidInput(inputIssues(parsed.issues));

              return;
            }

            input = parsed.value;
          } else if (normalized.input !== null) {
            reply = invalidInput();

            return;
          }

          await runChain(
            procedure.use,
            groupContext,
            { input, request, signal },
            async (context) => {
              const output = await procedure.handler({ context, input, request, signal });

              if (procedure.kind !== "stream") {
                reply = { status: 200, body: JSON.parse(serializeJson(output)) };

                return;
              }

              if (!start) {
                throw new Error("Launch streams need an HTTP response to run in");
              }

              const iterator = (output as AsyncIterable<unknown>)[Symbol.asyncIterator]();
              const finished = Promise.withResolvers<void>();

              start({ iterator, finished });
              await finished.promise;
              reply = { status: 200, body: null };
            },
          );
        },
      );
    } catch (error) {
      const outcome = outcomeOf(error);

      if (outcome?.kind === "forbidden") {
        return failure("FORBIDDEN");
      }

      return await declaredReply(procedure, error);
    }

    if (!reply) {
      throw new Error("Launch call finished without a reply");
    }

    return reply;
  } catch (error) {
    console.error("Launch RPC failed", error);

    return failure("INTERNAL");
  }
}

/**
 * Options for the generated `handleRequest` in `server.generated.ts`.
 */
export interface HandleOptions {
  /**
   * Hostnames RPCs are answered for, matched like Angular's `allowedHosts`: exactly,
   * `*.example.com` for subdomains only, or `*` for any host. An empty list refuses every
   * RPC. Pass the same array to `AngularNodeAppEngine`.
   */
  readonly allowedHosts: readonly string[];
  /**
   * Further origins allowed to call, as exact serialized origins such as
   * `https://app.example.com`: a public origin behind a proxy that rewrites `Host`, or a
   * sibling site. Defaults to none.
   */
  readonly origins?: readonly string[];
}

function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  for (const allowed of allowedHosts) {
    if (allowed === "*" || allowed === hostname) {
      return true;
    }

    if (allowed.startsWith("*.") && hostname.endsWith(allowed.slice(1))) {
      return true;
    }
  }

  return false;
}

/** Why `request` can't be proven same-origin, or `undefined` when it can. */
function crossSiteReason(request: Request, origins: readonly string[]): string | undefined {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (origin !== null && origins.includes(origin)) {
    return undefined;
  }

  if (site !== null) {
    if (site === "same-origin") {
      return undefined;
    }

    return `Sec-Fetch-Site is ${site}`;
  }

  if (origin !== null) {
    const own = new URL(request.url).origin;

    if (origin === own) {
      return undefined;
    }

    return `Origin ${origin} isn't ${own}`;
  }

  return "neither Sec-Fetch-Site nor Origin was sent";
}

/**
 * Answers an RPC HTTP request, or returns `null` for any other request.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `handleRequest` in `server.generated.ts`; call that instead.
 * Any path starting with `/_rpc/` is treated as an RPC request. Its URL's hostname must
 * be in `allowedHosts`, otherwise the reply is a plain-text 400 `Host not allowed`. It
 * must then be a `POST` with an `application/json` content type and no query string,
 * otherwise the reply is `INVALID_INPUT` with no issues. It must then come from the
 * app's own origin, otherwise the reply is `FORBIDDEN`: an `Origin` listed in `origins`
 * passes; otherwise `Sec-Fetch-Site`, when sent, must be `same-origin`; otherwise
 * `Origin`, when sent, must equal the request URL's origin; a request with neither
 * header is refused. No context is created for any of these refusals. A fresh context
 * is then created before the body is parsed; if that fails the reply is `INTERNAL`, even
 * when the body isn't JSON. Otherwise a body that isn't JSON gives `INVALID_INPUT` with
 * no issues.
 * JSON responses carry `Cache-Control: private, no-store`, `Vary: Cookie` and
 * `X-Content-Type-Options: nosniff`.
 *
 * A stream answers like any call until its handler returns its iterable. From then on the
 * response is a 200 `text/event-stream` (see `eventStream`) with
 * `Cache-Control: private, no-store, no-transform`, `Vary: Cookie`,
 * `X-Content-Type-Options: nosniff` and `X-Accel-Buffering: no`, and the call's signal
 * also aborts when the host cancels the body.
 *
 * @typeParam Definition - The application's context definition.
 * @param registry - The application's RPC groups.
 * @param application - The application binding.
 * @param request - The incoming server request.
 * @param options - The allowed hosts and further allowed origins.
 * @returns The RPC response, or `null` when the path doesn't start with `/_rpc/`.
 */
export async function handleRpc<Definition extends ContextDefinition<unknown>>(
  registry: Registry,
  application: ApplicationBinding<Definition>,
  request: Request,
  { allowedHosts, origins = [] }: HandleOptions,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/_rpc/")) {
    return null;
  }

  if (!hostAllowed(url.hostname, allowedHosts)) {
    console.error(`Launch refused an RPC for host ${url.hostname}`);

    return new Response("Host not allowed", {
      status: 400,
      headers: { "content-type": "text/plain", "x-content-type-options": "nosniff" },
    });
  }

  if (
    request.method !== "POST" ||
    !isJsonMediaType(request.headers.get("content-type")) ||
    url.search !== ""
  ) {
    return response(invalidInput());
  }

  const crossSite = crossSiteReason(request, origins);

  if (crossSite !== undefined) {
    console.error(`Launch refused a cross-origin RPC: ${crossSite}`);

    return response(failure("FORBIDDEN"));
  }

  let reply: Reply;

  try {
    const scope = await createRequestScope(application, request);
    let envelope: unknown;

    try {
      envelope = await request.json();
    } catch {
      return response(invalidInput());
    }

    // Hosts cancel a streaming body when its client goes away; that aborts the call too.
    const cancel = new AbortController();
    const signal = AbortSignal.any([scope.request.signal, cancel.signal]);
    const started = Promise.withResolvers<StreamStart>();
    const outcome = dispatch(
      registry,
      url.pathname,
      envelope,
      scope,
      application,
      scope.request,
      "http",
      signal,
      started.resolve,
    );
    // Failures before a stream's handler returned are ordinary replies.
    const first = await Promise.race([outcome, started.promise]);

    if ("iterator" in first) {
      return streamResponse(eventStream(first, outcome, cancel, signal));
    }

    reply = first;
  } catch (error) {
    console.error("Launch context failed", error);
    reply = failure("INTERNAL");
  }

  return response(reply);
}

function streamResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "private, no-store, no-transform",
      vary: "Cookie",
      "x-content-type-options": "nosniff",
      // nginx buffers proxied responses unless told not to.
      "x-accel-buffering": "no",
    },
  });
}

function response(reply: Reply): Response {
  return new Response(serializeJson(reply.body), {
    status: reply.status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      vary: "Cookie",
      "x-content-type-options": "nosniff",
    },
  });
}
