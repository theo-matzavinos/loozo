// Regeneration while serving, in its own process: node bench/serve.mjs <consumer> <result.json>
// <log.json> <options JSON>. Runs the consumer's real router serve target in-process through
// Architect, then toggles the edited route's title and times each write until (1) the full
// expected children table and route copy are on disk and (2) the served children chunk carries
// the change. Then it edits the same route's external template and times each write until
// Angular's next build, which must come without a generation pass.
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { packageDirectory, readWorkspace } from "./consumer.mjs";
import { editedRoute } from "./fixture.mjs";

// Counts the generation passes serve starts: generate() is rebound, in its own module, to one
// that counts each call. The bench and the serve builder share that module, so it's loaded only
// after the hook is in place.
const generationModule = new URL("../node/src/generation/generate.js", import.meta.url).href;
let generations = 0;

globalThis.countBenchGeneration = () => generations++;
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);

    if (url !== generationModule) {
      return loaded;
    }

    let source = loaded.source;

    if (typeof source !== "string") {
      source = new TextDecoder().decode(source);
    }

    return {
      ...loaded,
      source: `${source}
const benchGenerate = generate;
generate = (...args) => {
  globalThis.countBenchGeneration();

  return benchGenerate(...args);
};
`,
    };
  },
});

const { generate } = await import(generationModule);

const [consumer, resultPath, logPath, optionsJson] = process.argv.slice(2);
const { edits, timeoutMs, pollMs, settleMs } = JSON.parse(optionsJson);
// g0000/static/l0 is a child of g0000, so its record is in g0000's children table.
const generatedPath = join(consumer, "src/routes/g0000/children.generated.ts");
const copyPath = join(consumer, editedRoute.path.replace(/route\.ts$/, "route.generated.ts"));
const routeId = editedRoute.path;
const editedPath = join(consumer, editedRoute.path);
const pagePath = editedPath.replace(/route\.ts$/, "page.ts");
const templatePath = editedPath.replace(/route\.ts$/, "page.html");

async function readGenerated() {
  const [routes, copy] = await Promise.all([
    readFile(generatedPath, "utf8"),
    readFile(copyPath, "utf8"),
  ]);

  return { routes, copy };
}

function sameGenerated(left, right) {
  return left.routes === right.routes && left.copy === right.copy;
}

// A title edit changes two files: the route copy gains its .title step, and g0000's children table
// imports that copy and spreads its callbacks into the record; routes.generated.ts only types the
// route, so it doesn't change. Each edit waits for the exact bytes of both, which the generator
// itself writes here once each way, outside every timed window.
const { tsconfig, scanDirectories, outDirectory } = (await readWorkspace(consumer)).projects.proof
  .architect.build.options;
const withoutTitle = await readGenerated();
const anchor =
  "...record(destination_g0000_static_l0_route, destination_g0000_route),\nloadComponent:";

if (withoutTitle.routes.split(anchor).length !== 2) {
  throw new Error(`Expected exactly one title-less record for ${routeId} in ${generatedPath}`);
}

await writeFile(editedPath, editedRoute.source(true));
await generate(consumer, { tsconfig, scanDirectories, outDirectory }, () => false);

const withTitle = await readGenerated();

await writeFile(editedPath, editedRoute.source(false));
await generate(consumer, { tsconfig, scanDirectories, outDirectory }, () => false);

if (!sameGenerated(await readGenerated(), withoutTitle)) {
  throw new Error("Generating the title-less route again changed its generated files");
}

if (withTitle.routes.includes(anchor) || !withTitle.copy.includes(".title(")) {
  throw new Error(`The title edit did not reach ${routeId}'s record and copy`);
}

// The edited route's page moves its template to page.html for the template edits; serve.mjs puts
// it back when it ends, so later phases measure the first-generation fixture.
const inlinePage = await readFile(pagePath, "utf8");
const inlineTemplate = /template: `([^`]*)`,/.exec(inlinePage);

if (!inlineTemplate) {
  throw new Error(`Expected an inline template in ${pagePath}`);
}

await writeFile(templatePath, inlineTemplate[1]);
await writeFile(pagePath, inlinePage.replace(inlineTemplate[0], 'templateUrl: "./page.html",'));

// Served code may lower the object spread to __spreadValues/__spreadProps and rename bindings, so
// the probe follows the import() of g0000's loader in main.js to its children chunk, takes the
// record's text from its own path to the next loadComponent there and looks for a callbacks call.
// g0000's record runs from its path to the next record's path; its loader is the import() after
// loadChildren there.
const servedRoot = /path:\s*["']g0000["']([\s\S]*?)(?:path:\s*["']|$)/;
// The dev server serves an import as "/chunk-….js", with "?t=…" once hot updates replaced it.
const servedLoader = /loadChildren:[^]*?import\(\s*["']\.?\/([^"'?]+\.js(?:\?[^"']*)?)["']\s*\)/;
const servedRecord = /path:\s*["']static\/l0["']([\s\S]*?)loadComponent:/;

const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");

const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
const { workspace } = await core.workspaces.readWorkspace(consumer, host);
const registry = new core.json.schema.CoreSchemaRegistry();

registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

const architect = new Architect(
  new WorkspaceNodeModulesArchitectHost(workspace, consumer),
  registry,
);
const logger = new core.logging.Logger("bench");
const logs = [];
const outputs = [];
// The serve builder's error, which ends its output; every wait fails on it.
let serveError;

logger.subscribe((entry) => logs.push(entry));

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Polls until the predicate holds. The predicate gets the time left; a predicate that only
// finishes after the deadline still fails the wait.
async function waitFor(label, predicate) {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    if (serveError) {
      throw new Error(`The serve target failed while waiting for ${label}: ${serveError}`);
    }

    let done;

    try {
      done = await predicate(deadline - performance.now());
    } catch (error) {
      if (error?.name !== "TimeoutError") {
        throw error;
      }

      break;
    }

    if (done && performance.now() <= deadline) {
      return;
    }

    if (done) {
      break;
    }

    await delay(pollMs);
  }

  throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${label}`);
}

// Waits for the exact expected bytes of both files. Content that is neither the previous nor the
// expected bytes may be a write in progress (the two files are written one after the other); seen
// unchanged a second later, it's wrong output and fails the run.
async function waitForGenerated(previous, expected) {
  let unexpected;
  let unexpectedSince = 0;

  await waitFor("the generated files", async () => {
    const current = await readGenerated();

    if (sameGenerated(current, expected)) {
      return true;
    }

    if (sameGenerated(current, previous)) {
      unexpected = undefined;

      return false;
    }

    if (unexpected === undefined || !sameGenerated(current, unexpected)) {
      unexpected = current;
      unexpectedSince = performance.now();

      return false;
    }

    if (performance.now() - unexpectedSince >= 1000) {
      const evidence = `${resultPath}.unexpected-generated.json`;

      await writeFile(evidence, JSON.stringify(current, null, 2));
      throw new Error(`The generated files settled on unexpected bytes, saved to ${evidence}`);
    }

    return false;
  });
}

// Whether the served record has callbacks, or undefined while its chunk isn't served yet.
async function servedHasTitle(baseUrl, remainingMs) {
  const signal = AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)));
  const main = await (await fetch(new URL("main.js", baseUrl), { signal })).text();
  const loader = main.match(servedRoot)?.[1].match(servedLoader);

  if (!loader) {
    const evidence = `${resultPath}.unmatched-main.js`;

    await writeFile(evidence, main);
    throw new Error(`Served main.js has no children loader for g0000, saved to ${evidence}`);
  }

  const response = await fetch(new URL(loader[1], baseUrl), { signal });

  // A rebuild can replace the chunk between the two requests: not served yet, ask again.
  if (!response.ok) {
    return undefined;
  }

  const chunk = await response.text();
  const match = chunk.match(servedRecord);

  if (!match) {
    const evidence = `${resultPath}.unmatched-${loader[1].replace(/\?.*$/, "")}`;

    await writeFile(evidence, chunk);
    await writeFile(`${resultPath}.unmatched-main.js`, main);
    throw new Error(`Served ${loader[1]} has no record for ${routeId}, saved to ${evidence}`);
  }

  return /\b\w*callbacks\w*\(/.test(match[1]);
}

const result = {
  routeId,
  pollMs,
  settleMs,
  bytes: {
    withoutTitle: {
      routes: Buffer.byteLength(withoutTitle.routes),
      copy: Buffer.byteLength(withoutTitle.copy),
    },
    withTitle: {
      routes: Buffer.byteLength(withTitle.routes),
      copy: Buffer.byteLength(withTitle.copy),
    },
  },
  edits: [],
  templateEdits: [],
};
let run;
let subscription;
let failure;

try {
  const startup = performance.now();

  run = await architect.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
  subscription = run.output.subscribe({
    next: (output) => outputs.push(output),
    error: (error) => {
      serveError = String(error);
    },
  });
  await waitFor("the dev server", () => outputs.length > 0);

  const ready = outputs[0];

  if (!ready.success || !ready.baseUrl) {
    throw new Error(`The dev server's first build failed; see ${logPath}`);
  }

  result.startupMs = performance.now() - startup;
  await waitFor("the served title-less record", async (remainingMs) => {
    const titled = await servedHasTitle(ready.baseUrl, remainingMs);

    return titled === false;
  });

  let previous = withoutTitle;

  for (let index = 0; index < edits; index++) {
    const title = index % 2 === 0;
    let expected = withoutTitle;

    if (title) {
      expected = withTitle;
    }

    const before = await readGenerated();

    if (!sameGenerated(before, previous)) {
      throw new Error(`The generated files changed before edit ${index + 1}`);
    }

    const generationsBefore = generations;
    const started = performance.now();

    await writeFile(editedPath, editedRoute.source(title));
    await waitForGenerated(previous, expected);

    const generatedMs = performance.now() - started;

    await waitFor("the served edit", async (remainingMs) => {
      const titled = await servedHasTitle(ready.baseUrl, remainingMs);

      return titled === title;
    });

    const servedMs = performance.now() - started;
    const edit = {
      title,
      generatedMs,
      servedMs,
      before: { routes: sha256(before.routes), copy: sha256(before.copy) },
      after: { routes: sha256(expected.routes), copy: sha256(expected.copy) },
    };

    result.edits.push(edit);
    console.log(JSON.stringify(edit));
    previous = expected;
    // A watch pass queued behind this one may still run; let it finish before the next edit.
    await delay(settleMs);
    edit.generations = generations - generationsBefore;

    if (edit.generations === 0) {
      throw new Error(`Title edit ${index + 1} counted no generation pass`);
    }
  }

  // Template edits: Angular rebuilds for each, and serve doesn't regenerate. A pass would start
  // 150 ms after the write, well within the settle time each edit waits.
  for (let index = 0; index < edits; index++) {
    const generationsBefore = generations;
    const outputsBefore = outputs.length;
    const started = performance.now();

    await writeFile(templatePath, `${inlineTemplate[1]}<p>Template edit ${index + 1}</p>`);
    await waitFor("the build after the template edit", () => outputs.length > outputsBefore);

    const builtMs = performance.now() - started;
    const build = outputs[outputsBefore];

    await delay(settleMs);

    const edit = { builtMs, success: build.success, generations: generations - generationsBefore };

    result.templateEdits.push(edit);
    console.log(JSON.stringify({ template: true, ...edit }));

    if (!build.success) {
      throw new Error(`The build after template edit ${index + 1} failed; see ${logPath}`);
    }

    if (edit.generations !== 0) {
      throw new Error(`Template edit ${index + 1} started ${edit.generations} generation passes`);
    }

    if (!sameGenerated(await readGenerated(), previous)) {
      throw new Error(`The generated files changed after template edit ${index + 1}`);
    }
  }
} catch (error) {
  failure = error;
} finally {
  subscription?.unsubscribe();

  const stopped = run?.stop();

  if (stopped) {
    const timedOut = delay(timeoutMs).then(() => {
      throw new Error(`Timed out after ${timeoutMs / 1000} s stopping the dev server`);
    });

    try {
      await Promise.race([stopped, timedOut]);
    } catch (error) {
      failure ??= error;
    }
  }

  await writeFile(pagePath, inlinePage);
  await rm(templatePath, { force: true });
  result.outputs = {
    successful: outputs.filter((output) => output.success).length,
    failed: outputs.filter((output) => !output.success).length,
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  await writeFile(logPath, JSON.stringify({ logs, outputs, error: serveError }, null, 2));
}

if (failure) {
  console.error(failure);
  process.exit(1);
}

// Angular's worker threads can keep the process alive after Architect stops.
process.exit(0);
