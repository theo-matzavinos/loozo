import { frameworkFailures, type FrameworkCode } from "../client.js";
import { parseJson, serializeJson } from "../json.js";
import { inputIssues, type InputIssue } from "../input-issues.js";
import type { ApplicationBinding, ChainMiddleware, RuntimeProcedure } from "./application.js";
import { channelMessages, MessageRefused, type ChannelInbox } from "./channel-messages.js";
import { declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";
import { eventStream, settleStopped, type StreamStart } from "./event-stream.js";
import { callSettlement, holdCall } from "./hold-call.js";
import { outcomeOf, type Outcome } from "./outcomes.js";
import {
  createResponseEffects,
  type ResponseControl,
  type ResponseEffects,
} from "./response-effects.js";
import { createStageRunner, type Stage, type StageRunner } from "./stages.js";

// Shared by every copy of the package, so a scope one copy created runs its stages when
// another copy dispatches with it. The brand holds the binding identity, stage runner
// and rendering-call function.
const scopeMarker = Symbol.for("@loozo/angular-launch/private-request-scope/v4");

const bindingHeader = "x-loozo-launch-scope";

/**
 * A live server request bound to its application, holding the request's lazy context.
 *
 * @remarks
 * Created by the generated `createRequestScope` in `server.generated.ts`, which runs no
 * stage: each route's `.context()` stage runs at most once per scope, the first time an
 * RPC call needs it. Render a page by passing `scope.request` together with `scope` as
 * Angular's request context; RPC calls during that render fail with `INTERNAL` if the two
 * don't belong together.
 */
export interface RequestScope {
  /** A clone of the original request that carries the scope binding. */
  readonly request: Request;
  /** Internal: the scope's binding and state; not public API. */
  readonly [scopeMarker]: object;
}

// The brand's value, whose shape `isRequestScope` checks: the binding identity, the stage
// runner and the rendering-call function.
interface ScopeState {
  readonly appId: string;
  readonly binding: string;
  readonly run: StageRunner;
  readonly render: RenderingCall;
}

// One `"rendering"` call, run by the copy of the package that created the scope, with that
// copy's application binding.
type RenderingCall = (
  path: string,
  envelope: unknown,
  request: Request,
  signal: AbortSignal,
  effects: ResponseEffects,
) => Promise<Reply>;

/**
 * Runs one call made while rendering a page in the copy of the package that created
 * `scope`, with that copy's application binding.
 *
 * @remarks
 * Internal; not exported from a public entry point. Angular bundles the server entry, which
 * creates the scope and answers RPCs, apart from the server application, which renders, so
 * modules both import exist once in each bundle. Running the call in the creating copy
 * runs the stages, middleware and handlers of the bundle that answers RPCs, so a page and
 * an RPC of one server share their module state. The call otherwise runs as
 * {@link runProcedure} in `"rendering"` mode, which checks the scope again.
 *
 * @param scope - A scope that passed {@link assertBoundScope} for the rendering application.
 * @param path - The request path.
 * @param envelope - The parsed request body.
 * @param request - The page request the scope is bound to.
 * @param signal - The call's abort signal.
 * @param effects - Collects the call's cookies and headers.
 * @returns The reply to deliver.
 */
export function runRenderingCall(
  scope: RequestScope,
  path: string,
  envelope: unknown,
  request: Request,
  signal: AbortSignal,
  effects: ResponseEffects,
): Promise<Reply> {
  const state = scope[scopeMarker] as ScopeState;

  return state.render(path, envelope, request, signal, effects);
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
  if (typeof value !== "object" || value === null || !(scopeMarker in value)) {
    return false;
  }

  const state: unknown = value[scopeMarker];

  return (
    typeof state === "object" &&
    state !== null &&
    "run" in state &&
    typeof state.run === "function" &&
    "render" in state &&
    typeof state.render === "function" &&
    "request" in value &&
    value.request instanceof Request &&
    "appId" in state &&
    typeof state.appId === "string" &&
    "binding" in state &&
    typeof state.binding === "string"
  );
}

/**
 * Binds a live server request into a {@link RequestScope}, running nothing.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `createRequestScope` in `server.generated.ts`; call that instead.
 * The scope's `request` is a clone of `request` with an added
 * `x-loozo-launch-scope` header, so the original stays usable. Stages receive that clone
 * and its signal. Calls made while rendering with the scope run with `application`, in
 * this copy of the package: see {@link runRenderingCall}.
 *
 * @param application - The application binding.
 * @param request - The live server request.
 * @returns The request scope.
 * @throws TypeError when `request`'s body was already read and can't be cloned.
 */
export function createRequestScope(
  application: ApplicationBinding,
  request: Request,
): RequestScope {
  const binding = crypto.randomUUID();
  const headers = new Headers(request.headers);

  headers.set(bindingHeader, binding);

  // Keep the caller's body usable and its signal linked via native Request clones.
  const boundRequest = new Request(request.clone(), { headers });
  const run = createStageRunner({ request: boundRequest, signal: boundRequest.signal });
  const scope: RequestScope = {
    request: boundRequest,
    [scopeMarker]: {
      appId: application.id,
      binding,
      run,
      render: (path, envelope, pageRequest, signal, effects) =>
        runProcedure(path, envelope, scope, application, pageRequest, "rendering", signal, effects),
    } satisfies ScopeState,
  };

  return scope;
}

export function assertBoundScope(
  scope: unknown,
  application: ApplicationBinding,
  request: Request,
): asserts scope is RequestScope {
  if (isRequestScope(scope)) {
    const { appId, binding } = scope[scopeMarker] as ScopeState;

    if (
      appId === application.id &&
      binding.length > 0 &&
      scope.request.headers.get(bindingHeader) === binding &&
      request.headers.get(bindingHeader) === binding
    ) {
      return;
    }
  }

  throw new Error("Launch request/application scope binding mismatch");
}

/**
 * The HTTP status and JSON body {@link runProcedure} produces for one call. Internal.
 *
 * @remarks
 * Only status 200 is a result; every other status carries a frame `runProcedure` built itself,
 * so a result shaped like a frame stays data.
 */
export interface Reply {
  /** 200 for a result, 303 for a redirect, otherwise the error's or not-found's status. */
  readonly status: number;
  /**
   * The result, an `{ error: { code, message, data } }` frame, `{ redirect: { to } }` (with
   * `words` too for a translated application's destination with static segments) or
   * `{ notFound: null }`.
   */
  readonly body: unknown;
  /**
   * The stage that failed the call with an unexpected error, for diagnostics such as a
   * prerender fault. Never sent: only `body` reaches the wire.
   */
  readonly failedStage?: {
    /** The failing stage's route file. */
    readonly route: string;
    /** What the stage threw. */
    readonly error: unknown;
  };
}

function outcomeReply(outcome: Outcome, application: ApplicationBinding): Reply {
  if (outcome.kind === "forbidden") {
    return failure("FORBIDDEN");
  }

  if (outcome.kind === "notFound") {
    return { status: 404, body: { notFound: null } };
  }

  // No Location header: fetch then hands the 303 to the client instead of following it.
  // A translated app's page builds swap the listed static words into their own language; any
  // other frame keeps exactly `{ to }`.
  if (application.translateSegments && outcome.words.length > 0) {
    return { status: 303, body: { redirect: { to: outcome.to, words: outcome.words } } };
  }

  return { status: 303, body: { redirect: { to: outcome.to } } };
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

interface ChainArgs {
  readonly input: unknown;
  readonly request: Request;
  readonly signal: AbortSignal;
  readonly response: ResponseControl;
}

/**
 * Runs `chain` in order around `last`, passing each middleware the call's context.
 *
 * @remarks
 * Rejects when a middleware throws, calls `next` twice (whether it then returns or
 * throws) or returns anything other than its `next` result. A misused `next` never causes
 * an unhandled rejection: each promise it returns is observed here. When the rest of the
 * call a middleware started fails, that failure is logged unless the middleware rejected
 * with that same value, as an awaited rethrow does: the middleware may have left it
 * detached, or replaced it with another error such as `forbidden()`. Each rest of the call
 * a middleware starts goes to `track` too, so its end can be awaited after the call's.
 */
async function runChain(
  chain: readonly ChainMiddleware[],
  context: object,
  args: ChainArgs,
  track: (continuation: Promise<unknown>) => void,
  last: () => Promise<void>,
): Promise<void> {
  async function step(index: number): Promise<void> {
    if (index === chain.length) {
      await last();

      return;
    }

    const token = {};
    let calls = 0;
    let rest: Promise<object> | undefined;

    function next(): Promise<object> {
      calls += 1;

      let continued: Promise<object>;

      if (calls > 1) {
        continued = Promise.reject(new Error("Launch middleware called next() more than once"));
      } else {
        continued = step(index + 1).then(() => token);
        rest = continued;
        track(continued);
      }

      // A middleware that doesn't await this promise can't leave its rejection unhandled;
      // one that awaits it still sees the rejection.
      continued.catch(() => undefined);

      return continued;
    }

    const entry = chain[index];
    let run: (args: object) => Promise<unknown>;

    // A bare function is the middleware's `run`.
    if (typeof entry === "function") {
      run = entry as (args: object) => Promise<unknown>;
    } else {
      run = entry.run as (args: object) => Promise<unknown>;
    }

    let returned: unknown;
    let thrown: { readonly error: unknown } | undefined;

    try {
      returned = await run({ ...args, context, next });
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

  await step(0);
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
 * {@link provideRenderingBackend}. Internal; not exported from a public entry point. It
 * never rejects: every failure becomes a framework failure reply, and
 * unexpected errors are logged on the server.
 *
 * In order: the scope must belong to `application` and `request` (`INTERNAL`); the
 * path must be `/_rpc/<namespace>/<procedure>` for a registered procedure
 * (`RPC_NOT_FOUND`); a mutation, stream or channel in `"rendering"` mode is refused
 * (`FORBIDDEN`); a channel in `"http"` mode, or any other kind in `"socket"` mode, is
 * `RPC_NOT_FOUND`; the
 * envelope must be strict JSON (`INTERNAL` otherwise, such as for `{ input: undefined }`,
 * a cycle or an accessor), and exactly `{ input }` (`INVALID_INPUT` with no issues);
 * the owning route's stages run, root first, each at most once per scope (a stage that
 * throws `forbidden()`, `notFound()` or `redirect()` answers with that outcome, and any
 * other failure gives `INTERNAL` with the reply's `failedStage` naming it); the owning
 * route's `.use()` middleware runs with no input; the input must pass the schema
 * (`INVALID_INPUT` with the schema's issues), or be `null` without one (`INVALID_INPUT`
 * with no issues); the procedure's middleware runs with the validated input; then the
 * handler. The handler's strict JSON result is returned with status 200, and its
 * declared errors with their status. `forbidden()` thrown from middleware or the
 * handler gives `FORBIDDEN`, `notFound()` a 404 with `{ notFound: null }` and
 * `redirect()` a 303 with `{ redirect: { to } }` (plus `words` in a translated application);
 * a middleware that calls `next` twice
 * or doesn't return its result gives `INTERNAL`.
 *
 * A stream's handler returns an iterable instead of a result. Its iterator goes to
 * `start`, and the call goes on until the stream ends: the reply is then a 200 with
 * `null` body, or the failure the stream ended with. Without `start`, a stream fails
 * with `INTERNAL`.
 *
 * A channel runs like a stream, and its handler also receives `messages`, read from
 * `inbox` and validated with its message schema. A message that fails validation, or a
 * protocol violation the inbox reports, ends the call with `INVALID_INPUT`.
 *
 * Stages, middleware and handlers set cookies and headers through `effects.control`; the
 * caller commits and applies them. A stage writes to the call that first ran it.
 *
 * @param path - The request path.
 * @param envelope - The parsed request body.
 * @param scope - The request scope whose stages the call runs.
 * @param application - The application binding the scope must belong to.
 * @param request - The request the scope must be bound to.
 * @param mode - `"http"` for browser requests (the default), `"socket"` for websocket
 * upgrades, or `"rendering"` for calls made during server rendering.
 * @param signal - The call's abort signal. Defaults to `request`'s signal.
 * @param effects - Collects the call's cookies and headers. Defaults to fresh effects
 * nothing reads.
 * @param start - Receives a stream's or channel's iterator once its handler returned it.
 * @param inbox - A channel's incoming messages.
 * @param track - Receives each rest of the call a middleware starts with `next()`, which can
 * outlive the reply when the middleware didn't wait for it.
 * @returns The reply to send.
 */
export async function runProcedure(
  path: string,
  envelope: unknown,
  scope: RequestScope,
  application: ApplicationBinding,
  request: Request,
  mode: "http" | "socket" | "rendering" = "http",
  signal: AbortSignal = request.signal,
  effects: ResponseEffects = createResponseEffects(),
  start?: (stream: StreamStart) => void,
  inbox?: ChannelInbox,
  track: (continuation: Promise<unknown>) => void = () => undefined,
): Promise<Reply> {
  try {
    assertBoundScope(scope, application, request);

    const parts = /^\/_rpc\/([A-Za-z_][A-Za-z0-9_]*)\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(path);

    if (!parts || !Object.hasOwn(application.namespaces, parts[1])) {
      return failure("RPC_NOT_FOUND");
    }

    const namespace = application.namespaces[parts[1]];

    if (!Object.hasOwn(namespace.procedures, parts[2])) {
      return failure("RPC_NOT_FOUND");
    }

    const procedure = namespace.procedures[parts[2]];

    if (
      procedure.kind !== "query" &&
      procedure.kind !== "mutation" &&
      procedure.kind !== "stream" &&
      procedure.kind !== "channel"
    ) {
      throw new Error("Launch application contains an unsupported procedure");
    }

    // Rendering never performs writes, even for unmarked HttpClient calls or
    // callers/interceptors that relabel a generated method or enable caching. Streams
    // and channels don't finish, so they don't run during rendering either.
    if (mode === "rendering" && procedure.kind !== "query") {
      return failure("FORBIDDEN");
    }

    // A channel exists only as a websocket, and a websocket carries only channels.
    const isChannel = procedure.kind === "channel";

    if ((mode === "http" && isChannel) || (mode === "socket" && !isChannel)) {
      return failure("RPC_NOT_FOUND");
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
    const response = effects.control;
    let context: object = {};

    if (namespace.stages.length > 0) {
      const stages = namespace.stages as readonly [Stage, ...Stage[]];
      const state = scope[scopeMarker] as ScopeState;
      const staged = await state.run(stages, response);

      if ("failed" in staged) {
        const outcome = outcomeOf(staged.error);

        if (outcome !== undefined) {
          return outcomeReply(outcome, application);
        }

        console.error("Launch context stage failed", staged.error);

        return {
          ...failure("INTERNAL"),
          failedStage: { route: staged.failed.route, error: staged.error },
        };
      }

      context = staged.context;
    }

    try {
      // The route's middleware runs before validation, so it never sees the raw input.
      await runChain(
        namespace.use,
        context,
        { input: undefined, request, signal, response },
        track,
        async () => {
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
            context,
            { input, request, signal, response },
            track,
            async () => {
              const args: Record<string, unknown> = { context, input, request, signal, response };

              if (isChannel) {
                // The caller left while the pipeline ran: the handler doesn't run, and the
                // middleware's `next()` resolves.
                if (signal.aborted) {
                  reply = { status: 200, body: null };

                  return;
                }

                if (!inbox || !procedure.message) {
                  throw new Error("Launch channels need a websocket and a message schema");
                }

                args.messages = channelMessages(inbox, procedure.message);
              }

              const output = await procedure.handler(args);

              if (procedure.kind !== "stream" && !isChannel) {
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

      if (outcome !== undefined) {
        return outcomeReply(outcome, application);
      }

      // The caller sent a bad message: its own fault, not an unexpected failure.
      if (error instanceof MessageRefused) {
        return invalidInput(error.issues);
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
 * Options for the generated `handleRequest` and `handleUpgrade` in `server.generated.ts`.
 */
export interface HandleOptions {
  /**
   * Hostnames RPCs are answered for, matched like Angular's `allowedHosts`: exactly,
   * `*.example.com` for subdomains only, or `*` for any host. An empty list refuses every
   * RPC. Pass the same array to `AngularNodeAppEngine`, `handleRequest` and `handleUpgrade`.
   */
  readonly allowedHosts: readonly string[];
  /**
   * Further origins allowed to call, as exact serialized origins such as
   * `https://app.example.com`: a public origin behind a proxy that rewrites `Host`, or a
   * sibling site. Defaults to none.
   */
  readonly allowedOrigins?: readonly string[];
  /**
   * Keeps each call's work alive after its client leaves, on hosts that may otherwise cancel
   * it, such as Cloudflare Workers: pass `ctx.waitUntil.bind(ctx)`. Called once, as the call
   * starts, for every request that passed the checks before dispatch, with a promise that
   * resolves once the call has ended: its stages, its middleware (after `next()` too, and
   * whatever a `next()` called while the call ran started, even when its middleware didn't
   * wait for it) and its handler. Launch asks a stopped stream's or channel's iterator to
   * return once: a generator suspended at a `yield` runs its `finally` blocks, and one that
   * never started runs none of its body. The promise never rejects.
   * If `waitUntil` throws, Launch logs it and the call goes on without it. Defaults to none:
   * Node and Deno keep a request's work alive.
   */
  readonly waitUntil?: (settled: Promise<void>) => void;
}

/** The plain-text 400 for an RPC to a host that isn't allowed, logged. */
export function hostRefusal(hostname: string): Response {
  console.error(`Launch refused an RPC for host ${hostname}`);

  return new Response("Host not allowed", {
    status: 400,
    headers: { "content-type": "text/plain", "x-content-type-options": "nosniff" },
  });
}

export function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
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
export function crossSiteReason(
  request: Request,
  allowedOrigins: readonly string[],
): string | undefined {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (origin !== null && allowedOrigins.includes(origin)) {
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
 * app's own origin, otherwise the reply is `FORBIDDEN`: an `Origin` listed in `allowedOrigins`
 * passes; otherwise `Sec-Fetch-Site`, when sent, must be `same-origin`; otherwise
 * `Origin`, when sent, must equal the request URL's origin; a request with neither
 * header is refused. No stage runs for any of these refusals. A fresh request scope is
 * then created, which runs nothing, and a body that isn't JSON gives `INVALID_INPUT` with
 * no issues before any stage runs.
 * JSON responses carry `Cache-Control: private, no-store`, `Vary: Cookie` and
 * `X-Content-Type-Options: nosniff`.
 *
 * Once the call reached {@link runProcedure}, its response carries the headers and cookies the
 * call set, whatever its outcome. Launch's own headers replace the call's headers of the
 * same name, and each cookie adds a `Set-Cookie` header.
 *
 * A stream answers like any call until its handler returns its iterable. From then on the
 * response is a 200 `text/event-stream` (see `eventStream`) with
 * `Cache-Control: private, no-store, no-transform`, `Vary: Cookie`,
 * `X-Content-Type-Options: nosniff` and `X-Accel-Buffering: no`, and the call's signal
 * also aborts when the host cancels the body. The response's cookies and headers are the
 * ones set when the handler returned its iterable: setting a cookie later throws, and
 * later header changes are ignored.
 *
 * @param application - The application binding.
 * @param request - The incoming server request.
 * @param options - The allowed hosts and further allowed origins.
 * @returns The RPC response, or `null` when the path doesn't start with `/_rpc/`.
 */
export async function handleRpc(
  application: ApplicationBinding,
  request: Request,
  { allowedHosts, allowedOrigins = [], waitUntil }: HandleOptions,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/_rpc/")) {
    return null;
  }

  if (!hostAllowed(url.hostname, allowedHosts)) {
    return hostRefusal(url.hostname);
  }

  if (
    request.method !== "POST" ||
    !isJsonMediaType(request.headers.get("content-type")) ||
    url.search !== ""
  ) {
    return response(invalidInput());
  }

  const crossSite = crossSiteReason(request, allowedOrigins);

  if (crossSite !== undefined) {
    console.error(`Launch refused a cross-origin RPC: ${crossSite}`);

    return response(failure("FORBIDDEN"));
  }

  const effects = createResponseEffects();
  let reply: Reply;

  try {
    const scope = createRequestScope(application, request);
    let envelope: unknown;

    try {
      envelope = parseJson(await request.text());
    } catch {
      return response(invalidInput());
    }

    // Hosts cancel a streaming body when its client goes away; that aborts the call too.
    const cancel = new AbortController();
    const signal = AbortSignal.any([scope.request.signal, cancel.signal]);
    const started = Promise.withResolvers<StreamStart>();
    const continuations: Promise<unknown>[] = [];
    const outcome = runProcedure(
      url.pathname,
      envelope,
      scope,
      application,
      scope.request,
      "http",
      signal,
      effects,
      started.resolve,
      undefined,
      (continuation) => {
        continuations.push(continuation);
      },
    );

    holdCall(waitUntil, callSettlement(outcome, continuations));

    // Failures before a stream's handler returned are ordinary replies.
    const first = await Promise.race([outcome, started.promise]);

    if ("iterator" in first) {
      // The response starts now; the rest of the call is the stream itself.
      effects.commit();

      return streamResponse(eventStream(first, outcome, cancel, signal), effects);
    }

    // Middleware that didn't wait for `next()` can still get an iterable after this reply:
    // nothing streams it, so it ends at once and the middleware around it can finish.
    void started.promise.then((late) => settleStopped(late, undefined));
    reply = first;
  } catch (error) {
    console.error("Launch request scope failed", error);
    reply = failure("INTERNAL");
  }

  effects.commit();

  return response(reply, effects);
}

/** The call's headers, then Launch's own over them, then the call's cookies. */
export function responseHeaders(
  own: Readonly<Record<string, string>>,
  effects: ResponseEffects | undefined,
): Headers {
  const headers = new Headers(effects?.headers);

  for (const [name, value] of Object.entries(own)) {
    headers.set(name, value);
  }

  for (const cookie of effects?.cookies ?? []) {
    headers.append("set-cookie", cookie);
  }

  return headers;
}

function streamResponse(body: ReadableStream<Uint8Array>, effects: ResponseEffects): Response {
  const headers = responseHeaders(
    {
      "content-type": "text/event-stream",
      "cache-control": "private, no-store, no-transform",
      vary: "Cookie",
      "x-content-type-options": "nosniff",
      // nginx buffers proxied responses unless told not to.
      "x-accel-buffering": "no",
    },
    effects,
  );

  return new Response(body, { status: 200, headers });
}

export function response(reply: Reply, effects?: ResponseEffects): Response {
  const headers = responseHeaders(
    {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      vary: "Cookie",
      "x-content-type-options": "nosniff",
    },
    effects,
  );

  return new Response(serializeJson(reply.body), { status: reply.status, headers });
}
