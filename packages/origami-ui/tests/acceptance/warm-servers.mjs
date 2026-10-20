import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Runs after the web servers are up and before any test. A cold Angular dev server can render a
// deferred route empty when parallel workers request it concurrently for the first time, so request
// every fixture route of every server once, one at a time.
export default async function warm(config) {
  const routes = await readFile(".scratch/consumer/src/routes.ts", "utf8");
  const paths = [];

  for (const match of routes.matchAll(/path: "([\w-]+)"/g)) {
    paths.push(match[1]);
  }

  assert.ok(paths.length > 0, "No fixture routes found in the staged consumer's routes.ts");

  const origins = new Set();

  for (const project of config.projects) {
    origins.add(project.use.baseURL);
  }

  for (const origin of origins) {
    for (const path of paths) {
      const response = await fetch(`${origin}/${path}`);

      assert.equal(response.status, 200, `Warming ${origin}/${path}`);
      await response.text();
    }
  }
}
