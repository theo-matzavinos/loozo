import { Injectable, REQUEST_CONTEXT, inject } from "@angular/core";
import { FetchBackend, HttpErrorResponse, HttpResponse } from "@angular/common/http";
import type { HttpEvent, HttpRequest } from "@angular/common/http";
import { Observable } from "rxjs";
import { RPC_CALL } from "./rpc.generated";
import { isRequestContext } from "./context.server";
import { dispatch } from "./dispatch.server";
import { RENDER_FAULTS } from "./render-faults.server";

@Injectable()
export class DirectRpcBackend extends FetchBackend {
  readonly #context = inject(REQUEST_CONTEXT);
  readonly #faults = inject(RENDER_FAULTS);

  override handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const context = this.#context;
    const marked = request.context.get(RPC_CALL);

    if (!isRequestContext(context)) {
      if (!marked) {
        return super.handle(request);
      }

      return new Observable((subscriber) => {
        const failure = new Error(
          "Launch RPC requires live request context; prerender RPC is unsupported",
        );

        this.#faults.unsupportedContext = failure;
        subscriber.error(failure);
      });
    }

    const target = new URL(request.url, context.request.url);
    const ownOrigin = target.origin === new URL(context.request.url).origin;
    const ownRpc = ownOrigin && target.pathname.startsWith("/_rpc/g_todos/");

    if (!ownRpc && !marked) {
      return super.handle(request);
    }

    return new Observable((subscriber) => {
      function invalid(message: string): void {
        subscriber.error(
          new HttpErrorResponse({
            status: 400,
            error: { error: { code: "INVALID_INPUT", message, data: null } },
            url: request.url,
          }),
        );
      }

      if (!ownRpc) {
        invalid("RPC marker must target the registered same-origin endpoint");

        return;
      }

      const contentType = request.headers.get("content-type") ?? request.detectContentTypeHeader();

      if (request.method !== "POST" || !contentType?.startsWith("application/json")) {
        invalid("RPC requires POST with JSON input");

        return;
      }

      const conflictingAuth =
        request.headers.has("authorization") ||
        request.headers.has("proxy-authorization") ||
        request.headers.has("cookie") ||
        request.withCredentials ||
        request.credentials === "include" ||
        request.credentials === "same-origin";

      if (conflictingAuth) {
        invalid(
          "SSR RPC uses current request context; outgoing auth overrides are unsupported in this proof",
        );

        return;
      }

      let envelope: unknown;

      try {
        const body = request.serializeBody();

        if (typeof body !== "string") {
          invalid("RPC requires serialized JSON input");

          return;
        }

        envelope = JSON.parse(body);
      } catch {
        invalid("Invalid JSON input");

        return;
      }

      void dispatch(target.pathname, envelope, context, true).then(
        (reply) => {
          if (reply.status >= 400) {
            subscriber.error(
              new HttpErrorResponse({ status: reply.status, error: reply.body, url: request.url }),
            );

            return;
          }

          subscriber.next(
            new HttpResponse({ status: reply.status, body: reply.body, url: request.url }),
          );
          subscriber.complete();
        },
        (error: unknown) => {
          console.error(error);
          subscriber.error(
            new HttpErrorResponse({
              status: 500,
              error: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
              url: request.url,
            }),
          );
        },
      );
    });
  }
}
