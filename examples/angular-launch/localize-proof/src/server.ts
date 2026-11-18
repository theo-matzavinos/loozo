// Imported first: it installs the source-text $localize the host's destination copies need.
import { createRequestScope, handleRequest, handleUpgrade } from "../generated/server.generated";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  createWebRequestFromNodeRequest,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import { createUpgradeHandler } from "@loozo/angular-launch/node";

// Loopback-only proof server: one host list for pages and RPCs.
const allowedHosts = ["127.0.0.1", "localhost"];
const angular = new AngularNodeAppEngine({ allowedHosts });
const browser = fileURLToPath(new URL("../browser", import.meta.url));
const types: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

// The browser build's scripts and styles, so the app hydrates; pages come from the engine.
async function asset(pathname: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  const type = types[extname(pathname)];

  if (!type) {
    return undefined;
  }

  const file = resolve(join(browser, decodeURIComponent(pathname)));

  if (!file.startsWith(browser + sep)) {
    return undefined;
  }

  const info = await stat(file).catch(() => undefined);

  if (!info?.isFile()) {
    return undefined;
  }

  return { type, bytes: await readFile(file) };
}

export const reqHandler = createNodeRequestHandler(async (request, response) => {
  try {
    const closed = new AbortController();

    response.once("close", () => {
      if (!response.writableFinished) {
        queueMicrotask(() => closed.abort());
      }
    });

    const native = createWebRequestFromNodeRequest(request);
    const web = new Request(native, { signal: AbortSignal.any([native.signal, closed.signal]) });
    const rpc = await handleRequest(web, { allowedHosts });

    if (rpc) {
      await writeResponseToNodeResponse(rpc, response);

      return;
    }

    const file = await asset(new URL(web.url).pathname);

    if (file) {
      response.setHeader("content-type", file.type);
      response.end(file.bytes);

      return;
    }

    const scope = createRequestScope(web);
    const page = await angular.handle(scope.request, scope);

    if (!page) {
      response.statusCode = 404;
      response.end("No page");

      return;
    }

    await writeResponseToNodeResponse(page, response);
  } catch (error) {
    if (response.destroyed && error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    console.error(error);
    response.statusCode = 500;
    response.end("Internal server error");
  }
});

const upgrade = createUpgradeHandler((request) => handleUpgrade(request, { allowedHosts }));

if (isMainModule(import.meta.url)) {
  const server = createServer(reqHandler);

  server.on("upgrade", upgrade);
  server.listen(Number(process.env["PORT"] ?? "0"), "127.0.0.1", () => {
    const address = server.address();

    if (address && typeof address === "object") {
      console.log(`LAUNCH_READY http://127.0.0.1:${address.port}`);
    }
  });
}
