import type { AnyRoute, ContributionOf } from "@loozo/angular-router/_core";
import type { InvalidInputData } from "../input-issues.js";
import type { ChainContext } from "../route-types.js";
import { bindNamespaces, launchChain, type ApplicationBinding } from "../server/application.js";
import type {
  ErrorDefinitions,
  OutputOf,
  Procedure,
  ProcedureDefinition,
  Schema,
} from "../server/definitions.js";
import { createRequestScope, runProcedure } from "../server/dispatch.js";
import { createResponseEffects } from "../server/response-effects.js";
import type { Stage } from "../server/stages.js";

// The namespaces the route's own `.remote()` declares: the last record of its chain. A route
// that used no Launch step adds no record, so that's its nearest ancestor that did, which
// owns those namespaces in production too.
type OwnNamespaces<Route> =
  ContributionOf<Route> extends readonly [...unknown[], infer Own]
    ? Own extends { readonly remote: (...args: never[]) => infer Namespaces }
      ? Namespaces
      : {}
    : {};
type CallableName<Procedures> = {
  [Name in keyof Procedures & string]: Procedures[Name] extends {
    readonly kind: "query" | "mutation";
  }
    ? Name
    : never;
}[keyof Procedures & string];
type ProcedureAt<Route, Namespace, Name> = Namespace extends keyof OwnNamespaces<Route>
  ? Name extends keyof OwnNamespaces<Route>[Namespace]
    ? OwnNamespaces<Route>[Namespace][Name]
    : never
  : never;
// What the chain's first record's `.context()` stage returns, `{}` without one: the context
// the stage below it receives.
type RootContext<Route> =
  ContributionOf<Route> extends readonly [infer Root, ...unknown[]]
    ? ChainContext<readonly [Root]>
    : never;
type InputOption<Value> =
  Value extends Procedure<infer Input, infer _Output, infer _Kind, infer _Errors, infer _Message>
    ? Input extends Schema<infer Caller, unknown>
      ? {
          /** The input as a caller sends it: the input schema's input type. */
          readonly input: Caller;
        }
      : {
          /** A procedure without an input schema takes no input. */
          readonly input?: undefined;
        }
    : never;

/**
 * The options {@link callProcedure} takes.
 *
 * @typeParam Route - The route that declares the procedure's namespace.
 * @typeParam Value - The procedure, as the route's `.remote()` declares it.
 */
export type CallProcedureOptions<Route, Value> = {
  /**
   * The context the root route's `.context()` stage would return, which the stages below it
   * receive; `{}` when the root route has no stage. The root stage itself doesn't run, so
   * what it would provide, such as the user or a database client, can be a fake.
   */
  readonly context: RootContext<Route>;
  /**
   * The request stages, middleware and the handler receive as `request`, and whose signal
   * they receive as `signal`. Defaults to a `POST` to
   * `http://localhost/_rpc/<namespace>/<procedure>`.
   */
  readonly request?: Request;
} & InputOption<Value>;

type FrameworkError =
  | {
      /** The input failed the input schema, or was sent to a procedure without one. */
      readonly code: "INVALID_INPUT";
      /** Launch's message for the code. */
      readonly message: string;
      /** The input schema's issues; none for input sent to a procedure without one. */
      readonly data: InvalidInputData;
    }
  | {
      /** A stage, middleware or the handler threw `forbidden()`, or the call failed. */
      readonly code: "FORBIDDEN" | "INTERNAL";
      /** Launch's message for the code. */
      readonly message: string;
      /** Always `null`. */
      readonly data: null;
    };
type DeclaredError<Errors extends ErrorDefinitions> = {
  [Code in keyof Errors & string]: {
    /** The declared error's code. */
    readonly code: Code;
    /** The declared message. */
    readonly message: string;
    /** The error's data, as its data schema produced it. */
    readonly data: OutputOf<Errors[Code]["data"]>;
  };
}[keyof Errors & string];

/**
 * How a {@link callProcedure} call settled, as the browser would receive it, with the
 * cookies and headers it set.
 *
 * @remarks
 * Narrow with `"result" in call`, `"error" in call`, `"redirect" in call` or
 * `"notFound" in call`, then an error by its `code`. Results and error data are what the
 * wire carries: strict JSON, parsed back.
 *
 * @typeParam Value - The procedure, as the route's `.remote()` declares it.
 */
export type ProcedureCall<Value> =
  Value extends Procedure<infer _Input, infer Output, infer _Kind, infer Errors, infer _Message>
    ? (
        | {
            /** Always 200: the handler returned. */
            readonly status: 200;
            /** The handler's result. */
            readonly result: Awaited<Output>;
          }
        | {
            /** The error's status: the declared one, or Launch's for its own codes. */
            readonly status: number;
            /** A framework failure or one of the procedure's declared errors. */
            readonly error: FrameworkError | DeclaredError<Errors>;
          }
        | {
            /** Always 303. */
            readonly status: 303;
            /**
             * A stage, middleware or the handler threw `redirect()`. Never with `words`: the
             * test's binding isn't translated.
             */
            readonly redirect: {
              /** The root-relative URL `createUrl` built for the destination. */
              readonly to: `/${string}`;
            };
          }
        | {
            /** Always 404. */
            readonly status: 404;
            /** A stage, middleware or the handler threw `notFound()`. Always `null`. */
            readonly notFound: null;
          }
      ) & {
        /** The `Set-Cookie` values the call set, in order. */
        readonly cookies: readonly string[];
        /** The headers the call set, without Launch's own response headers. */
        readonly headers: Headers;
      }
    : never;

/**
 * Calls a query or mutation of a route's own namespace in a test, from the context its root
 * route's stage would return.
 *
 * @remarks
 * The call runs as an RPC over HTTP from that point: the `.context()` stages below the root
 * route, in a fresh request scope; the declaring route's `.use()` middleware; input
 * validation; the procedure's middleware; then the handler. The root route's own stage
 * never runs: `options.context` stands in for what it returns, so a test can pass fakes for
 * what that stage provides. The root route is the first route of the chain that uses a
 * Launch step.
 *
 * The call isn't an HTTP request: there's no host, origin, method or content-type check,
 * no `createRequestScope` and no server rendering. Test those through the generated
 * `handleRequest`.
 *
 * Every outcome settles to a value: a result, an error, a redirect or a not-found. An
 * unexpected failure settles to `INTERNAL`, logged with `console.error` as the server logs
 * it. Streams and channels can't be called.
 *
 * @example
 * ```ts
 * import { callProcedure } from "@loozo/angular-launch/testing";
 * import todos from "./route";
 *
 * const call = await callProcedure(todos, "todos", "complete", {
 *   context: { todos: fakeTodos, user: { id: "alice" } },
 *   input: { id: "2" },
 * });
 *
 * expect(call).toMatchObject({ status: 404, error: { code: "NOT_FOUND" } });
 * ```
 *
 * @param route - The authored route (its `route.ts` default export) whose own `.remote()`
 * declares `namespace`. Call an ancestor's namespace through the ancestor's route.
 * @param namespace - One of the route's own namespaces.
 * @param procedure - A query or mutation of the namespace.
 * @param options - The root context, the input and the request.
 * @returns How the call settled, with the cookies and headers it set.
 * @throws TypeError for a route Launch's `defineRoute` didn't make, a namespace the route
 * doesn't declare, an unknown procedure, a stream or a channel. Rejects when
 * `options.request`'s body was already read.
 */
export async function callProcedure<
  Route extends AnyRoute,
  Namespace extends keyof OwnNamespaces<Route> & string,
  Name extends CallableName<OwnNamespaces<Route>[Namespace]>,
>(
  route: Route,
  namespace: Namespace,
  procedure: Name,
  options: CallProcedureOptions<Route, ProcedureAt<Route, Namespace, Name>>,
): Promise<ProcedureCall<ProcedureAt<Route, Namespace, Name>>> {
  const chain = launchChain(route);

  if (chain === undefined || chain.length === 0) {
    throw new TypeError("callProcedure takes a route made by Launch's defineRoute");
  }

  const own = chain[chain.length - 1];

  if (typeof own.remote !== "function") {
    throw new TypeError(`The route declares no namespace; ${namespace} isn't its own`);
  }

  const {
    context,
    input = null,
    request = new Request(`http://localhost/_rpc/${namespace}/${procedure}`, { method: "POST" }),
  } = options as { readonly context: object; readonly input?: unknown; readonly request?: Request };
  // The supplied context stands in for the root route's stage; the stages below it run.
  const stages: Stage[] = [{ run: () => context, route: "the context passed to callProcedure" }];

  for (const record of chain.slice(1)) {
    if (typeof record.context === "function") {
      stages.push({ run: record.context as Stage["run"], route: "a stage below the root route" });
    }
  }

  const namespaces = bindNamespaces(own, stages);

  if (!Object.hasOwn(namespaces, namespace)) {
    throw new TypeError(
      `The route doesn't declare the namespace ${namespace}; call an ancestor's namespace through its route`,
    );
  }

  const procedures: Readonly<Record<string, ProcedureDefinition>> =
    namespaces[namespace].procedures;

  if (!Object.hasOwn(procedures, procedure)) {
    throw new TypeError(`The namespace ${namespace} has no procedure ${procedure}`);
  }

  const { kind } = procedures[procedure];

  if (kind !== "query" && kind !== "mutation") {
    throw new TypeError(`callProcedure runs queries and mutations, not a ${kind}`);
  }

  const application: ApplicationBinding = { id: "launch-call-procedure", namespaces };
  const scope = createRequestScope(application, request);
  const effects = createResponseEffects();
  const reply = await runProcedure(
    `/_rpc/${namespace}/${procedure}`,
    { input },
    scope,
    application,
    scope.request,
    "http",
    scope.request.signal,
    effects,
  );

  effects.commit();

  let settled: object;

  // Every other status carries a frame Launch built: an error, a redirect or a not-found.
  if (reply.status === 200) {
    settled = { result: reply.body };
  } else {
    settled = reply.body as object;
  }

  const call = {
    status: reply.status,
    ...settled,
    cookies: [...effects.cookies],
    // A copy, as the server's response takes: later writes don't reach a settled call.
    headers: new Headers(effects.headers),
  };

  return call as ProcedureCall<ProcedureAt<Route, Namespace, Name>>;
}
