import {
  inject,
  InjectionToken,
  REQUEST,
  REQUEST_CONTEXT,
  makeEnvironmentProviders,
} from "@angular/core";
import type { ApplicationRef, EnvironmentProviders } from "@angular/core";
import { FetchBackend, HttpBackend, HttpErrorResponse, HttpResponse } from "@angular/common/http";
import type { HttpEvent, HttpRequest } from "@angular/common/http";
import { Observable } from "rxjs";
import { RPC_CALL } from "../generated.js";
import {
  dispatch,
  failure,
  isJsonMediaType,
  assertBoundScope,
  type ApplicationBinding,
  type Registry,
  type Reply,
} from "./dispatch.js";

const renderFaults = new InjectionToken<{ unsupportedContext?: Error }>("Launch render faults");

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
 * any other request to `/_rpc/` on the current request's origin, are intercepted and
 * run in-process in `"rendering"` mode, so mutations are refused with `FORBIDDEN`. All
 * other requests, including ones to `/_rpc/` on another origin that don't come from a
 * generated client, go to Angular's `FetchBackend`.
 *
 * For intercepted calls, Angular's `REQUEST_CONTEXT` must be the {@link RequestScope}
 * created for Angular's `REQUEST`, or the calls fail with `INTERNAL`. A generated-client
 * call outside `/_rpc/` on the current request's origin fails with `INVALID_INPUT`, as
 * does any intercepted call with a query string, fragment, URL credentials, a method
 * other than `POST`, a non-JSON content type, its own `Authorization`,
 * `Proxy-Authorization` or `Cookie` header, or its own credentials setting.
 *
 * Without a live request, as during prerendering, calls from generated clients and
 * requests to a relative `/_rpc/` path fail and the fault is recorded for
 * {@link finishLaunchRendering}; other requests still go to `FetchBackend`.
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
        const fallback = inject(FetchBackend);
        const faults = inject(renderFaults);

        return {
          handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
            const marked = request.context.get(RPC_CALL);
            let target: URL;

            if (nativeRequest instanceof Request) {
              target = new URL(request.urlWithParams, nativeRequest.url);
            } else {
              target = new URL(request.urlWithParams, "http://launch.invalid");

              const localRpc =
                target.origin === "http://launch.invalid" && target.pathname.startsWith("/_rpc/");

              if (!marked && !localRpc) {
                return fallback.handle(request);
              }

              const error = new Error(
                "Launch RPC requires live request context; prerender RPC is unsupported",
              );

              faults.unsupportedContext = error;

              return new Observable((subscriber) => subscriber.error(error));
            }

            const ownOrigin = target.origin === new URL(nativeRequest.url).origin;
            const ownRpc = ownOrigin && target.pathname.startsWith("/_rpc/");

            if (!marked && !ownRpc) {
              return fallback.handle(request);
            }

            return new Observable((subscriber) => {
              function deliver(reply: Reply): void {
                if (reply.status >= 400) {
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

              try {
                assertBoundScope(context, application, nativeRequest);
              } catch (error) {
                console.error("Launch SSR scope binding failed", error);
                deliver(failure("INTERNAL"));

                return;
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
                deliver(failure("INVALID_INPUT"));

                return;
              }

              let envelope: unknown;

              try {
                const body = request.serializeBody();

                if (typeof body !== "string") {
                  deliver(failure("INVALID_INPUT"));

                  return;
                }

                envelope = JSON.parse(body);
              } catch {
                deliver(failure("INVALID_INPUT"));

                return;
              }

              void dispatch(
                registry,
                target.pathname,
                envelope,
                context,
                application,
                nativeRequest,
                "rendering",
              ).then(deliver);
            });
          },
        } satisfies HttpBackend;
      },
    },
  ]);
}

/**
 * Waits for the server application to become stable and fails the render if an RPC was
 * called without a live request.
 *
 * @remarks
 * Angular's prerendering can swallow resolver errors and still report success. Return
 * this from your server bootstrap so a page that calls an RPC during prerendering fails
 * the build instead of producing a broken page. The application must include the
 * generated `provideServer()`.
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
 * @throws The recorded error when an RPC was called without a live request; the
 * application is destroyed first.
 */
// Native prerender can swallow resolver errors. Propagate only the unsupported
// Launch context fault after native stability, without manufacturing a request.
export async function finishLaunchRendering(app: ApplicationRef): Promise<ApplicationRef> {
  await app.whenStable();

  const fault = app.injector.get(renderFaults).unsupportedContext;

  if (fault) {
    app.destroy();

    throw fault;
  }

  return app;
}
