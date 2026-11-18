import { createServer } from "node:http";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";

const angular = new AngularNodeAppEngine();

export const reqHandler = createNodeRequestHandler(async (request, response) => {
  try {
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
  const port = Number(process.env.PORT || 4000);

  createServer(reqHandler).listen(port, "127.0.0.1");
}
