import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
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

      writeResponseToNodeResponse(result, response);
    })
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env["PORT"] || "4311");

  app.listen(port, "127.0.0.1", (error) => {
    if (error) {
      throw error;
    }

    console.log(`Setup readiness server: http://127.0.0.1:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
