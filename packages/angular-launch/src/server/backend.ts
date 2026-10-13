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
