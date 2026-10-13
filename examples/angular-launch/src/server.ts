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
import { createContext, handleRequest } from "../generated/server.generated";
import { stats } from "./database.server";

const angular = new AngularNodeAppEngine();
const browser = resolve(dirname(fileURLToPath(import.meta.url)), "../browser");
export const reqHandler = createNodeRequestHandler(async (request, response) => {
  try {
    const web = createWebRequestFromNodeRequest(request);
    const url = new URL(web.url);

    // Loopback-only test diagnostics; deliberately not a production server.
    if (url.pathname === "/__proof/stats") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(stats));

      return;
    }

    const rpc = await handleRequest(web);

    if (rpc) {
      await writeResponseToNodeResponse(rpc, response);

      return;
    }

    if (extname(url.pathname)) {
      const asset = resolve(browser, `.${url.pathname}`);

      if (!asset.startsWith(`${browser}${sep}`)) {
        response.statusCode = 400;
        response.end("Invalid asset");

        return;
      }

      try {
        const bytes = await readFile(asset);

        if (asset.endsWith(".js")) {
          response.setHeader("content-type", "text/javascript");
        }

        response.end(bytes);
      } catch {
        response.statusCode = 404;
        response.end("Not found");
      }

      return;
    }

    const scope = await createContext(web);
    const result = await angular.handle(scope.request, scope);

    if (!result) {
      response.statusCode = 404;
      response.end("Not found");

      return;
    }

    const headers = new Headers(result.headers);

    headers.set("cache-control", "private, no-store");
    headers.set("vary", "Cookie");
    headers.delete("content-length");

    const html = (await result.text()).replace(
      "</body>",
      '<script>globalThis.__proofSsrList=document.getElementById("todo-list");</script></body>',
    );

    await writeResponseToNodeResponse(
      new Response(html, { status: result.status, headers }),
      response,
    );
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.end("Internal server error");
  }
});

if (isMainModule(import.meta.url)) {
  const server = createServer(reqHandler);

  server.listen(Number(process.env.PORT ?? "0"), "127.0.0.1", () => {
    const address = server.address();

    if (address && typeof address === "object") {
      console.log(`LAUNCH_READY http://127.0.0.1:${address.port}`);
    }
  });
}
