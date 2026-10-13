// Handwritten generated-shape fixture. No server value imports.
import { inject } from "@angular/core";
import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from "@angular/common/http";
import type { Subscription } from "rxjs";
import { RpcError, isFailure } from "./wire";
import { serializeJson } from "./json";
import type { ListResult, Todo } from "./wire";

export const RPC_CALL = new HttpContextToken(() => false);

type Options = { signal?: AbortSignal };

function call<Value>(
  http: HttpClient,
  procedure: string,
  input: unknown,
  query: boolean,
  { signal }: Options = {},
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    let subscription: Subscription | undefined;
    let settled = false;

    function cleanup(): void {
      signal?.removeEventListener("abort", abort);
      subscription?.unsubscribe();
    }

    function abort(): void {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new DOMException("RPC call aborted", "AbortError"));
    }

    if (signal?.aborted) {
      abort();

      return;
    }

    const envelope: unknown = JSON.parse(serializeJson({ input }));

    signal?.addEventListener("abort", abort, { once: true });
    subscription = http
      .post<Value>(`/_rpc/g_todos/${procedure}`, envelope, {
        context: new HttpContext().set(RPC_CALL, true),
        transferCache: query,
      })
      .subscribe({
        next(value) {
          settled = true;
          cleanup();
          resolve(value);
        },
        error(error: unknown) {
          settled = true;
          cleanup();

          if (error instanceof HttpErrorResponse && isFailure(error.error)) {
            const failure = error.error.error;

            reject(new RpcError(failure.code, failure.message, failure.data, error.status));

            return;
          }

          reject(error);
        },
      });

    // Transfer-cache responses can arrive synchronously before assignment.
    if (settled) {
      cleanup();
    }
  });
}

export function injectRpc() {
  const http = inject(HttpClient);

  return {
    todos: {
      list: (options?: Options) => call<ListResult>(http, "list", null, true, options),
      slow: (options?: Options) => call<ListResult>(http, "slow", null, true, options),
      invalidResult: (options?: Options) =>
        call<never>(http, "invalid-result", null, true, options),
      add: (title: string, options?: Options) => call<Todo>(http, "add", title, false, options),
      complete: (input: { id: string }, options?: Options) =>
        call<Todo>(http, "complete", input, false, options),
    },
  };
}
