import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";

const angular = new AngularNodeAppEngine();
const asset = /^\/[\w.-]+\.(js|css|map)$/;

export const reqHandler = createNodeRequestHandler(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (asset.test(pathname)) {
      const file = new URL(`../browser${pathname}`, import.meta.url);
      let type = "text/javascript";

      if (pathname.endsWith(".css")) {
        type = "text/css";
      }

      response.setHeader("Content-Type", type);
      response.end(await readFile(file));

      return;
    }

    if (pathname === "/favicon.ico") {
      response.statusCode = 204;
      response.end();

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
    response.end("SSR failed");
  }
});

if (isMainModule(import.meta.url)) {
  createServer(reqHandler).listen(Number(process.env["PORT"] ?? 4611), "127.0.0.1");
}
