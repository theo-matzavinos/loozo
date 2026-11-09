// Test-only native entry. No extra UI or production browser globals.
import { bootstrapApplication } from "@angular/platform-browser";
import { runInInjectionContext } from "@angular/core";
import { Router } from "@angular/router";
import { App } from "./app";
import { config } from "./config";
import { injectRpc as injectLiveRpc } from "./routes/+authenticated/+live/live/rpc.generated";
import { injectRpc } from "./routes/+authenticated/todos/rpc.generated";

declare global {
  var __launchBeginCancellation: (() => void) | undefined;
  var __launchAbort: (() => void) | undefined;
  var __launchCancelled: Promise<string> | undefined;
  var __launchFrameworkError: (() => Promise<string>) | undefined;
  var __launchCompleteMissing: ((id: string) => Promise<{ code: string; id: string }>) | undefined;
  var __launchNavigate: ((url: string) => Promise<boolean>) | undefined;
  var __launchStable: Promise<true> | undefined;
  var __launchChannel:
    | ((titles: string[]) => Promise<{ lists: number[]; outcome: string }>)
    | undefined;
  var __launchTicks:
    | ((
        input: { count: number; everyMs: number; fail: boolean },
        stopAfter?: number,
      ) => Promise<{ values: unknown[]; outcome: string }>)
    | undefined;
}

const app = await bootstrapApplication(App, config);

// An open stream must not keep the app unstable.
globalThis.__launchStable = app.whenStable().then(() => true);
const rpc = runInInjectionContext(app.injector, injectRpc);
const live = runInInjectionContext(app.injector, injectLiveRpc);

globalThis.__launchNavigate = (url) => app.injector.get(Router).navigateByUrl(url);

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

// Reads the ticks stream, stopping after `stopAfter` values when given.
globalThis.__launchTicks = async (input, stopAfter) => {
  const values: unknown[] = [];

  try {
    for await (const value of live.live.ticks(input)) {
      values.push(value);

      if (values.length === stopAfter) {
        break;
      }
    }

    return { values, outcome: "ended" };
  } catch (error) {
    if (live.live.ticks.isError(error)) {
      return { values, outcome: `${error.name}:${error.code}:${error.status}:${error.message}` };
    }

    throw error;
  }
};

// Adds `titles` over the add channel, sending alongside reading, and closes it after the
// list that follows the last one.
globalThis.__launchChannel = async (titles) => {
  const channel = live.live.add();
  const lists: number[] = [];
  const sent = (async () => {
    for (const title of titles) {
      await channel.send({ title });
    }
  })();

  try {
    for await (const todos of channel) {
      lists.push(todos.length);

      if (lists.length === titles.length + 1) {
        break;
      }
    }

    await sent;

    return { lists, outcome: "closed" };
  } catch (error) {
    if (live.live.add.isError(error)) {
      return {
        lists,
        outcome: `${error.name}:${error.code}:${error.status}:${JSON.stringify(error.data)}`,
      };
    }

    throw error;
  }
};
