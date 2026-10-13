import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  createWebRequestFromNodeRequest,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import { createContext } from "./context.server";
import { dispatch } from "./dispatch.server";
import { stats } from "./store.server";

const angular = new AngularNodeAppEngine();
const browserDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../browser");

export const reqHandler = createNodeRequestHandler(async (request, response) => {
  try {
    const webRequest = createWebRequestFromNodeRequest(request);
    const url = new URL(webRequest.url);

    // Loopback-only proof diagnostics; not a production endpoint.
    if (url.pathname === "/__proof/stats") {
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(stats));

      return;
    }

    if (url.pathname.startsWith("/_rpc/g_todos/")) {
      if (webRequest.method !== "POST") {
        response.statusCode = 405;
        response.end("POST required");

        return;
      }

      let envelope: unknown;

      try {
        envelope = await webRequest.json();
      } catch {
        response.statusCode = 400;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({ error: { code: "INVALID_INPUT", message: "Invalid JSON", data: null } }),
        );

        return;
      }

      const context = await createContext(webRequest);
      const reply = await dispatch(url.pathname, envelope, context, false);

      response.statusCode = reply.status;
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(reply.body));

      return;
    }

    if (extname(url.pathname)) {
      const asset = resolve(browserDirectory, `.${url.pathname}`);

      if (!asset.startsWith(`${browserDirectory}${sep}`)) {
        response.statusCode = 400;
        response.end("Invalid asset path");

        return;
      }

      try {
        const bytes = await readFile(asset);
        let contentType = "application/octet-stream";

        if (asset.endsWith(".js")) {
          contentType = "text/javascript";
        }

        if (asset.endsWith(".css")) {
          contentType = "text/css";
        }

        response.setHeader("content-type", contentType);
        response.end(bytes);
      } catch {
        response.statusCode = 404;
        response.end("Asset not found");
      }

      return;
    }

    const context = await createContext(webRequest);
    const result = await angular.handle(webRequest, context);

    if (!result) {
      response.statusCode = 404;
      response.end("Not found");

      return;
    }

    const html = await result.text();
    const headers = new Headers(result.headers);

    headers.set("cache-control", "private, no-store");
    headers.set("vary", "Cookie");
    headers.delete("content-length");

    // Capture the genuine SSR DOM before deferred bootstrap scripts execute.
    const captured = html.replace(
      "</body>",
      '<script>globalThis.__proofSsrList = document.getElementById("todo-list");</script></body>',
    );

    await writeResponseToNodeResponse(
      new Response(captured, { status: result.status, headers }),
      response,
    );
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ error: { code: "INTERNAL", message: "Internal server error", data: null } }),
    );
  }
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env.PORT ?? "0");
  const server = createServer(reqHandler);

  server.listen(port, "127.0.0.1", () => {
    const address = server.address();

    if (address && typeof address === "object") {
      console.log(`PROOF_READY http://127.0.0.1:${address.port}`);
    }
  });
}
