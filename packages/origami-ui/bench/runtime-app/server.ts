// examples/origami-ui/src/server.ts, listening on PORT (0 picks a free port), printing the address
// it got for the runner, and passing a failed response write to express.
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
import { type AddressInfo } from "node:net";
import { join } from "node:path";

const app = express();
const angularApp = new AngularNodeAppEngine();
const browserDirectory = join(import.meta.dirname, "../browser");

app.use(express.static(browserDirectory, { maxAge: "1y", index: false, redirect: false }));
app.use((request, response, next) => {
  angularApp
    .handle(request)
    .then((result) => {
      if (!result) {
        next();

        return;
      }

      return writeResponseToNodeResponse(result, response);
    })
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env["PORT"] || "0");
  const server = app.listen(port, "127.0.0.1", (error) => {
    if (error) {
      throw error;
    }

    const address = server.address() as AddressInfo;

    console.log(`Listening on http://127.0.0.1:${address.port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
