import {
  DestroyRef,
  DOCUMENT,
  inject,
  InjectionToken,
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  makeEnvironmentProviders,
} from "@angular/core";
import type { ApplicationRef, EnvironmentProviders } from "@angular/core";
import { FetchBackend, HttpBackend, HttpErrorResponse, HttpResponse } from "@angular/common/http";
import type { HttpEvent, HttpRequest } from "@angular/common/http";
import { Observable } from "rxjs";
import { RPC_CALL } from "../generated.js";
import { parseJson } from "../json.js";
import {
  dispatch,
  failure,
  invalidInput,
  isJsonMediaType,
  assertBoundScope,
  createRequestScope,
  type ApplicationBinding,
  type RequestScope,
  type Registry,
  type Reply,
} from "./dispatch.js";
import { createResponseEffects } from "./response-effects.js";

const renderFaults = new InjectionToken<{ fault?: Error }>("Launch render faults");

/**
 * Provides the server-rendering transport that runs RPC calls in-process with the
 * current request's context.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `provideServer` in `server.generated.ts`; add that to your server application config,
 * after `provideHttpClient()`, instead of calling this.
 *
 * It replaces Angular's `HttpBackend` on the server. Calls from generated clients, and
 * any other request to `/_rpc/` on the page's origin, are intercepted and run in-process
 * in `"rendering"` mode, so mutations and streams are refused with `FORBIDDEN`. All other
 * requests, including ones to `/_rpc/` on another origin that don't come from a generated
 * client, go to Angular's `FetchBackend`.
 *
 * For intercepted calls during server rendering, Angular's `REQUEST_CONTEXT` must be the
 * {@link RequestScope} created for Angular's `REQUEST`, or the calls fail with `INTERNAL`.
 * A generated-client call outside `/_rpc/` on the page's origin fails with
 * `INVALID_INPUT` with no issues, as does any intercepted call with a query string,
 * fragment, URL credentials, a method other than `POST`, a non-JSON content type, its own
 * `Authorization`, `Proxy-Authorization` or `Cookie` header, or its own credentials
 * setting.
 *
 * Cookies an intercepted call sets are appended to `RESPONSE_INIT`'s headers when the
 * call settles, whatever its outcome, so they reach the page response; its other headers
 * are dropped. Angular copies those headers into the page response once the app is first
 * stable, so cookies from a call that settles later, such as one awaited in a
 * `BEFORE_APP_SERIALIZED` hook, are lost. Without `RESPONSE_INIT`, a call that set cookies
 * fails with `INTERNAL`.
 *
 * Without `REQUEST`, as when Angular prerenders a page, the first intercepted call creates
 * the render's context from a cookie-less `GET` of the page's URL, and every call in the
 * render shares it. Its signal aborts when the application is destroyed. A call that
 * doesn't answer 200, or sets a cookie, records a fault for
 * {@link finishLaunchRendering}, as does a context factory that throws. Only faults
 * recorded before the app is first stable fail the build.
 *
 * @param registry - The application's RPC groups.
 * @param application - The application binding.
 * @returns The environment providers for the server application.
 */
export function provideLaunchServer(
  registry: Registry,
  application: ApplicationBinding,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: renderFaults, useFactory: () => ({}) },
    {
      provide: HttpBackend,
      useFactory: () => {
        const context: unknown = inject(REQUEST_CONTEXT);
        const nativeRequest = inject(REQUEST);
        const responseInit = inject(RESPONSE_INIT, { optional: true });
        const fallback = inject(FetchBackend);
        const faults = inject(renderFaults);
        const document = inject(DOCUMENT);
        const destroyed = new AbortController();
        let prerenderScope: Promise<RequestScope> | undefined;

        inject(DestroyRef).onDestroy(() => destroyed.abort());

        // The first fault is the one the build reports.
        function recordFault(message: string, cause?: unknown): void {
          faults.fault ??= new Error(`Launch can't prerender this page: ${message}`, { cause });
        }

        return {
          handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
            const marked = request.context.get(RPC_CALL);
            const prerendering = !(nativeRequest instanceof Request);
            let page: string;

            if (nativeRequest instanceof Request) {
              page = nativeRequest.url;
            } else {
              page = document.location.href;
            }

            const target = new URL(request.urlWithParams, page);
            const ownOrigin = target.origin === new URL(page).origin;
            const ownRpc = ownOrigin && target.pathname.startsWith("/_rpc/");

            if (!marked && !ownRpc) {
              return fallback.handle(request);
            }

            return new Observable((subscriber) => {
              function deliver(reply: Reply): void {
                if (prerendering && reply.status !== 200) {
                  recordFault(
                    `${target.pathname} answered ${reply.status} ${JSON.stringify(reply.body)}`,
                  );
                }

                // Only 200 is a result: a redirect's 303 frame must not reach the caller as data.
                if (reply.status !== 200) {
                  subscriber.error(
                    new HttpErrorResponse({
                      status: reply.status,
                      error: reply.body,
                      url: request.urlWithParams,
                    }),
                  );

                  return;
                }

                subscriber.next(
                  new HttpResponse({
                    status: reply.status,
                    body: reply.body,
                    url: request.urlWithParams,
                  }),
                );
                subscriber.complete();
              }

              let live: { scope: RequestScope; request: Request } | undefined;

              if (nativeRequest instanceof Request) {
                try {
                  assertBoundScope(context, application, nativeRequest);
                  live = { scope: context, request: nativeRequest };
                } catch (error) {
                  console.error("Launch SSR scope binding failed", error);
                  deliver(failure("INTERNAL"));

                  return;
                }
              }

              const authOverride =
                request.headers.has("authorization") ||
                request.headers.has("proxy-authorization") ||
                request.headers.has("cookie") ||
                request.withCredentials ||
                request.credentials !== undefined;
              const contentType =
                request.headers.get("content-type") ?? request.detectContentTypeHeader();

              if (
                !ownRpc ||
                target.search !== "" ||
                target.hash !== "" ||
                target.username !== "" ||
                target.password !== "" ||
                request.method !== "POST" ||
                !isJsonMediaType(contentType) ||
                authOverride
              ) {
                deliver(invalidInput());

                return;
              }

              let envelope: unknown;

              try {
                const body = request.serializeBody();

                if (typeof body !== "string") {
                  deliver(invalidInput());

                  return;
                }

                envelope = parseJson(body);
              } catch {
                deliver(invalidInput());

                return;
              }

              // Aborts when the page request does, or when HttpClient unsubscribes first.
              const call = new AbortController();
              const effects = createResponseEffects();
              let settled = false;

              async function run(): Promise<void> {
                let scope: RequestScope;
                let pageRequest: Request;

                if (live) {
                  scope = live.scope;
                  pageRequest = live.request;
                } else {
                  prerenderScope ??= createRequestScope(
                    application,
                    new Request(page, { signal: destroyed.signal }),
                  );

                  try {
                    scope = await prerenderScope;
                  } catch (error) {
                    recordFault("its context factory threw", error);
                    console.error("Launch prerender context creation failed", error);
                    deliver(failure("INTERNAL"));

                    return;
                  }

                  pageRequest = scope.request;
                }

                const reply = await dispatch(
                  registry,
                  target.pathname,
                  envelope,
                  scope,
                  application,
                  pageRequest,
                  "rendering",
                  AbortSignal.any([pageRequest.signal, call.signal]),
                  effects,
                );

                settled = true;
                effects.commit();

                if (effects.cookies.length === 0) {
                  deliver(reply);

                  return;
                }

                // A prerendered page is a file: there's no response to put a cookie on.
                if (prerendering) {
                  recordFault(`${target.pathname} set a cookie`);
                  deliver(reply);

                  return;
                }

                if (responseInit === null) {
                  console.error(
                    "Launch can't send cookies set during rendering without RESPONSE_INIT",
                  );
                  deliver(failure("INTERNAL"));

                  return;
                }

                // Angular builds the page response, and its redirects, from these headers. It
                // creates them as Headers; keep that object for anyone holding it.
                let headers = responseInit.headers;

                if (!(headers instanceof Headers)) {
                  headers = new Headers(headers);
                  responseInit.headers = headers;
                }

                for (const cookie of effects.cookies) {
                  headers.append("set-cookie", cookie);
                }

                deliver(reply);
              }

              void run();

              return () => {
                if (!settled) {
                  call.abort(new DOMException("RPC call aborted", "AbortError"));
                }
              };
            });
          },
        } satisfies HttpBackend;
      },
    },
  ]);
}

/**
 * Waits for the server application to become stable and fails the render if a Launch call
 * failed while Angular prerendered the page.
 *
 * @remarks
 * A prerendered page is written once and served to every visitor, so each Launch call it
 * makes must answer 200 without setting a cookie; a mutation or stream is refused with
 * `FORBIDDEN`, so it fails too. Angular's prerendering can swallow resolver errors and still
 * report success, and a failed `injectQuery` only renders its error state, so return this
 * from your server bootstrap to fail the build instead of producing a broken page. The
 * application must include the generated `provideServer()`. Server-rendered pages are
 * unaffected: their failures reach the caller as usual.
 *
 * It checks once the app is first stable, which covers calls from guards, resolvers and
 * rendering. Angular runs `BEFORE_APP_SERIALIZED` hooks afterwards and only logs their
 * errors, so a call made in one isn't checked and the page is still written; don't make
 * Launch calls there.
 *
 * @example
 * ```ts
 * export default async function bootstrap(context: BootstrapContext) {
 *   const app = await bootstrapApplication(App, serverConfig, context);
 *
 *   return finishLaunchRendering(app);
 * }
 * ```
 *
 * @param app - The bootstrapped server application.
 * @returns The same application once it is stable.
 * @throws The first recorded fault, naming the call and its reply, the cookie or the
 * context factory's error; the application is destroyed first.
 */
export async function finishLaunchRendering(app: ApplicationRef): Promise<ApplicationRef> {
  await app.whenStable();

  const fault = app.injector.get(renderFaults).fault;

  if (fault) {
    app.destroy();

    throw fault;
  }

  return app;
}
