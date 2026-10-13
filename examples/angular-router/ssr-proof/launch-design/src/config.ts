import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
} from "@angular/common/http";
import { PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { firstValueFrom } from "rxjs";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { StaticPage, Todos } from "./app";
import { injectRpc } from "./rpc.generated";
import { RpcError, isFailure } from "./wire";

async function renderMutationProbe(): Promise<string> {
  const platform = inject(PLATFORM_ID);
  const rpc = injectRpc();

  if (isPlatformBrowser(platform)) {
    return "browser probe skipped";
  }

  try {
    await rpc.todos.add("This must never be written during SSR");

    return "unexpected mutation";
  } catch (error) {
    if (error instanceof RpcError) {
      return `${error.code}:${error.message}`;
    }

    throw error;
  }
}

async function unmarkedMutationProbe(): Promise<string> {
  const platform = inject(PLATFORM_ID);
  const http = inject(HttpClient);

  if (isPlatformBrowser(platform)) {
    return "browser probe skipped";
  }

  try {
    await firstValueFrom(
      http.post(
        "/_rpc/g_todos/add",
        { input: "Unmarked mutation must also be blocked" },
        { context: new HttpContext(), transferCache: false },
      ),
    );

    return "unexpected mutation";
  } catch (error) {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 403 &&
      isFailure(error.error) &&
      error.error.error.message === "Mutations are forbidden during rendering"
    ) {
      return "unmarked mutation rejected";
    }

    throw error;
  }
}

async function invalidResultProbe(): Promise<string> {
  const platform = inject(PLATFORM_ID);
  const rpc = injectRpc();

  if (isPlatformBrowser(platform)) {
    return "browser probe skipped";
  }

  try {
    await rpc.todos.invalidResult();

    return "unexpected JSON result";
  } catch (error) {
    if (error instanceof RpcError) {
      return `${error.code}:${error.message}`;
    }

    throw error;
  }
}

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideRouter([
      { path: "static", component: StaticPage },
      {
        path: "",
        pathMatch: "full",
        component: Todos,
        resolve: { todos: () => injectRpc().todos.list() },
      },
      { path: "render-mutation", component: Todos, resolve: { probe: renderMutationProbe } },
      { path: "unmarked-mutation", component: Todos, resolve: { probe: unmarkedMutationProbe } },
      { path: "invalid-result", component: Todos, resolve: { probe: invalidResultProbe } },
      { path: "prerender", component: Todos, resolve: { todos: () => injectRpc().todos.list() } },
      {
        path: "uncached",
        component: Todos,
        resolve: {
          todos: () =>
            firstValueFrom(
              inject(HttpClient).post(
                "/_rpc/g_todos/list",
                { input: null },
                { transferCache: false },
              ),
            ),
        },
      },
    ]),
  ],
};
