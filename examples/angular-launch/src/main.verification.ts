// Test-only native entry. No extra UI or production browser globals.
import { bootstrapApplication } from "@angular/platform-browser";
import { runInInjectionContext } from "@angular/core";
import { Router } from "@angular/router";
import { RpcRedirect } from "@loozo/angular-launch";
import { injectActiveRoute } from "../generated/routes.generated";
import { App } from "./app";
import { config } from "./config";
import { destination as identity } from "./routes/+authenticated/identity/destination.generated";
import { destination as todos } from "./routes/+authenticated/todos/destination.generated";
import { destination as live } from "./routes/+authenticated/live/destination.generated";

declare global {
  var __launchBeginCancellation: (() => void) | undefined;
  var __launchAbort: (() => void) | undefined;
  var __launchCancelled: Promise<string> | undefined;
  var __launchFrameworkError: (() => Promise<string>) | undefined;
  var __launchIdentity: (() => Promise<{ user: string; own: string }>) | undefined;
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
// The helpers reach clients through the active route, read with the root injector here and
// narrowed later, when a helper runs: each needs its page active.
const active = runInInjectionContext(app.injector, injectActiveRoute);

function todosRoute() {
  const route = active();

  if (!route?.is(todos)) {
    throw new Error("helper needs /todos active");
  }

  return route;
}

function liveRoute() {
  const route = active();

  if (!route?.is(live)) {
    throw new Error("helper needs /live active");
  }

  return route;
}

globalThis.__launchNavigate = (url) => app.injector.get(Router).navigateByUrl(url);

globalThis.__launchFrameworkError = async () => {
  const { list } = todosRoute().remote.todos;

  try {
    await list({ transferCache: false });

    return "unexpected success";
  } catch (error) {
    if (list.isError(error)) {
      return `${error.name}:${error.code}:${error.status}:${error.data}`;
    }

    throw error;
  }
};

// identity declares no procedure and keeps no router step, so its handle's `remote` holds
// only what its ancestors declare. It has no `..`: "/" has no winner, since every route
// there has children.
globalThis.__launchIdentity = async () => {
  const route = active();

  if (!route?.is(identity)) {
    throw new Error("helper needs /identity active");
  }

  const session = await route.remote.session.current({ transferCache: false });

  return { user: session.user, own: route.link({}).toString() };
};

globalThis.__launchCompleteMissing = async (id) => {
  const { complete } = todosRoute().remote.todos;

  try {
    await complete({ id });

    throw new Error("Expected a missing todo");
  } catch (error) {
    if (complete.isError(error) && error.code === "NOT_FOUND") {
      const missingId: string = error.data.id;

      return { code: error.code, id: missingId };
    }

    throw error;
  }
};

globalThis.__launchBeginCancellation = () => {
  const controller = new AbortController();
  const { list } = todosRoute().remote.todos;

  globalThis.__launchAbort = () => controller.abort();
  globalThis.__launchCancelled = list({ signal: controller.signal, transferCache: false }).then(
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
  const { ticks } = liveRoute().remote.live;
  const values: unknown[] = [];

  try {
    for await (const value of ticks(input)) {
      values.push(value);

      if (values.length === stopAfter) {
        break;
      }
    }

    return { values, outcome: "ended" };
  } catch (error) {
    if (ticks.isError(error)) {
      return { values, outcome: `${error.name}:${error.code}:${error.status}:${error.message}` };
    }

    throw error;
  }
};

// Adds `titles` over the add channel, sending alongside reading, and closes it after the
// list that follows the last one. Reports a declared or framework error, or a redirect.
globalThis.__launchChannel = async (titles) => {
  const { add } = liveRoute().remote.live;
  const channel = add();
  const lists: number[] = [];
  const sent = (async () => {
    for (const title of titles) {
      await channel.send({ title });
    }
  })();

  // A failure that closes the channel rejects pending sends too; reading reports it.
  sent.catch(() => undefined);

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
    if (add.isError(error)) {
      return {
        lists,
        outcome: `${error.name}:${error.code}:${error.status}:${JSON.stringify(error.data)}`,
      };
    }

    if (error instanceof RpcRedirect) {
      return { lists, outcome: `${error.name}:${error.to}` };
    }

    throw error;
  }
};
