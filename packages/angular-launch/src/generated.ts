import { isPlatformServer } from "@angular/common";
import { inject, PLATFORM_ID } from "@angular/core";
import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from "@angular/common/http";
import type { Subscription } from "rxjs";
import {
  RpcError,
  recognizedError,
  type CallOptions,
  type ErrorMetadata,
  type StreamCallOptions,
} from "./client.js";
import { serializeJson } from "./json.js";
import { openStream } from "./stream.js";

export const RPC_CALL = new HttpContextToken(() => false);

export interface ClientMethod {
  readonly name: string;
  readonly input: boolean;
  readonly kind: "query" | "mutation" | "stream";
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

// Streams don't run during server rendering: iterating one fails at once with FORBIDDEN.
function refusedStream(error: RpcError<string, unknown>): AsyncIterator<never> {
  return { next: () => Promise.reject(error) };
}

function stream(
  server: boolean,
  group: string,
  method: ClientMethod,
  input: unknown,
  options: StreamCallOptions = {},
): AsyncIterable<unknown> {
  function own(error: RpcError<string, unknown>): RpcError<string, unknown> {
    errorOwners.set(error, { group, method: method.name });

    return error;
  }

  // Each iteration is its own request, so iterating again reconnects.
  return {
    [Symbol.asyncIterator]: () => {
      if (server) {
        return refusedStream(own(new RpcError("FORBIDDEN", 403)));
      }

      return openStream(`/_rpc/${group}/${method.name}`, input, method.errors, own, options);
    },
  };
}

export function injectClient(
  groups: Readonly<Record<string, { readonly methods: readonly ClientMethod[] }>>,
): unknown {
  const http = inject(HttpClient);
  let server = false;

  // Only streams depend on the platform.
  for (const group of Object.values(groups)) {
    if (group.methods.some((method) => method.kind === "stream")) {
      server = isPlatformServer(inject(PLATFORM_ID));

      break;
    }
  }
  const result: Record<string, Record<string, unknown>> = Object.create(null);

  for (const [namespace, group] of Object.entries(groups)) {
    const methods: Record<string, unknown> = Object.create(null);

    for (const method of group.methods) {
      let invoke: (...args: unknown[]) => unknown;

      if (method.kind === "stream") {
        if (method.input) {
          invoke = (input, options) =>
            stream(server, namespace, method, input, options as StreamCallOptions | undefined);
        } else {
          invoke = (options) =>
            stream(server, namespace, method, null, options as StreamCallOptions | undefined);
        }
      } else if (method.input) {
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
