import { inject } from "@angular/core";
import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from "@angular/common/http";
import type { Subscription } from "rxjs";
import { RpcError, recognizedError, type CallOptions, type ErrorMetadata } from "./client.js";
import { serializeJson } from "./json.js";

export const RPC_CALL = new HttpContextToken(() => false);

export interface ClientMethod {
  readonly name: string;
  readonly input: boolean;
  readonly kind: "query" | "mutation";
  readonly errors: readonly ErrorMetadata[];
}

const errorOwners = new WeakMap<object, { group: string; method: string }>();

function call(
  http: HttpClient,
  group: string,
  method: ClientMethod,
  input: unknown,
  { signal, transferCache = true }: CallOptions = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
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

    if (method.kind === "mutation") {
      transferCache = false;
    }

    subscription = http
      .post<unknown>(`/_rpc/${group}/${method.name}`, envelope, {
        context: new HttpContext().set(RPC_CALL, true),
        transferCache,
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

          if (error instanceof HttpErrorResponse) {
            const frame = recognizedError(error.error, error.status, method.errors);

            if (frame) {
              const converted = new RpcError(frame.code, error.status, frame.data, frame.message);

              errorOwners.set(converted, { group, method: method.name });
              reject(converted);

              return;
            }
          }

          reject(error);
        },
      });

    if (settled) {
      cleanup();
    }
  });
}

export function injectClient(
  groups: Readonly<Record<string, { readonly methods: readonly ClientMethod[] }>>,
): unknown {
  const http = inject(HttpClient);
  const result: Record<string, Record<string, unknown>> = Object.create(null);

  for (const [namespace, group] of Object.entries(groups)) {
    const methods: Record<string, unknown> = Object.create(null);

    for (const method of group.methods) {
      let invoke: (...args: unknown[]) => Promise<unknown>;

      if (method.input) {
        invoke = (input, options) =>
          call(http, namespace, method, input, options as CallOptions | undefined);
      } else {
        invoke = (options) =>
          call(http, namespace, method, null, options as CallOptions | undefined);
      }

      methods[method.name] = Object.assign(invoke, {
        kind: method.kind,
        isError: (error: unknown): boolean => {
          if (typeof error !== "object" || error === null) {
            return false;
          }

          const owner = errorOwners.get(error);

          return owner?.group === namespace && owner.method === method.name;
        },
      });
    }

    result[namespace] = methods;
  }

  return result;
}
