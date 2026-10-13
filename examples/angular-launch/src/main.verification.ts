// Test-only native entry. No extra UI or production browser globals.
import { bootstrapApplication } from "@angular/platform-browser";
import { runInInjectionContext } from "@angular/core";
import { App } from "./app";
import { config } from "./config";
import { injectRpc } from "./routes/+authenticated/todos/rpc.generated";

declare global {
  var __launchBeginCancellation: (() => void) | undefined;
  var __launchAbort: (() => void) | undefined;
  var __launchCancelled: Promise<string> | undefined;
  var __launchFrameworkError: (() => Promise<string>) | undefined;
  var __launchCompleteMissing: ((id: string) => Promise<{ code: string; id: string }>) | undefined;
}

const app = await bootstrapApplication(App, config);
const rpc = runInInjectionContext(app.injector, injectRpc);

globalThis.__launchFrameworkError = async () => {
  try {
    await rpc.todos.list({ transferCache: false });

    return "unexpected success";
  } catch (error) {
    if (rpc.todos.list.isError(error)) {
      return `${error.name}:${error.code}:${error.status}:${error.data}`;
    }

    throw error;
  }
};

globalThis.__launchCompleteMissing = async (id) => {
  try {
    await rpc.todos.complete({ id });

    throw new Error("Expected a missing todo");
  } catch (error) {
    if (rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
      const missingId: string = error.data.id;

      return { code: error.code, id: missingId };
    }

    throw error;
  }
};

globalThis.__launchBeginCancellation = () => {
  const controller = new AbortController();

  globalThis.__launchAbort = () => controller.abort();
  globalThis.__launchCancelled = rpc.todos
    .list({ signal: controller.signal, transferCache: false })
    .then(
      () => "unexpected success",
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return error.name;
        }

        throw error;
      },
    );
};
