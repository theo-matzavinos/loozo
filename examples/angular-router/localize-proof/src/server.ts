import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";

const angular = new AngularNodeAppEngine();
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
    const url = new URL(request.url ?? "/", "http://localhost");
    const file = await asset(url.pathname);

    if (file) {
      response.setHeader("content-type", file.type);
      response.end(file.bytes);

      return;
    }

    const result = await angular.handle(request);

    if (result) {
      await writeResponseToNodeResponse(result, response);

      return;
    }

    response.statusCode = 404;
    response.end("not found");
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.end(`SSR failed: ${String(error)}`);
  }
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env.PORT || 4000);

  createServer(reqHandler).listen(port, "127.0.0.1");
}
