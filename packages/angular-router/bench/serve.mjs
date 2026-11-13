// Regeneration while serving, in its own process: node bench/serve.mjs <consumer> <result.json>
// <log.json> <options JSON>. Runs the consumer's real router serve target in-process through
// Architect, then toggles the edited route's title and times each write until (1) the full
// expected routes.generated.ts is on disk and (2) the served main.js carries the change.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { packageDirectory } from "./consumer.mjs";
import { editedRoute } from "./fixture.mjs";

const [consumer, resultPath, logPath, optionsJson] = process.argv.slice(2);
const { edits, timeoutMs, pollMs, settleMs } = JSON.parse(optionsJson);
const generatedPath = join(consumer, "generated/routes.generated.ts");
const routeId = editedRoute.path;

// The generated record without a title has no callbacks; with one, the callbacks spread sits
// between its data and loadComponent. Each edit waits for these exact full-file bytes.
const withoutTitle = await readFile(generatedPath, "utf8");
const anchor = `data: { __loozoAngularRouterRouteId: ${JSON.stringify(routeId)} },\nloadComponent:`;

if (withoutTitle.split(anchor).length !== 2) {
  throw new Error(`Expected exactly one title-less record for ${routeId} in ${generatedPath}`);
}

const withTitle = withoutTitle.replace(
  anchor,
  `data: { __loozoAngularRouterRouteId: ${JSON.stringify(routeId)} },\n...callbacks(getRouteSet(), ${JSON.stringify(routeId)}),\nloadComponent:`,
);

// Served code may lower the object spread to __spreadValues/__spreadProps, so the probe takes the
// record's text from its id to the next loadComponent and looks for a callbacks call in it.
const escapedId = routeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const servedRecord = new RegExp(
  `__loozoAngularRouterRouteId:\\s*["']${escapedId}["']\\s*\\}([\\s\\S]*?)loadComponent:`,
);

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

// Waits for the exact expected bytes. Content that is neither the previous nor the expected bytes
// may be a write in progress; seen unchanged a second later, it's wrong output and fails the run.
async function waitForGenerated(previous, expected) {
  let unexpected;
  let unexpectedSince = 0;

  await waitFor("routes.generated.ts", async () => {
    const current = await readFile(generatedPath, "utf8");

    if (current === expected) {
      return true;
    }

    if (current === previous) {
      unexpected = undefined;

      return false;
    }

    if (current !== unexpected) {
      unexpected = current;
      unexpectedSince = performance.now();

      return false;
    }

    if (performance.now() - unexpectedSince >= 1000) {
      const evidence = `${resultPath}.unexpected-routes.generated.ts`;

      await writeFile(evidence, current);
      throw new Error(`routes.generated.ts settled on unexpected bytes, saved to ${evidence}`);
    }

    return false;
  });
}

async function servedHasTitle(baseUrl, remainingMs) {
  const response = await fetch(new URL("main.js", baseUrl), {
    signal: AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs))),
  });
  const body = await response.text();
  const match = body.match(servedRecord);

  if (!match) {
    const evidence = `${resultPath}.unmatched-main.js`;

    await writeFile(evidence, body);
    throw new Error(`Served main.js has no record for ${routeId}, saved to ${evidence}`);
  }

  return /\b\w*callbacks\w*\(/.test(match[1]);
}

const result = {
  routeId,
  pollMs,
  settleMs,
  bytes: { withoutTitle: Buffer.byteLength(withoutTitle), withTitle: Buffer.byteLength(withTitle) },
  edits: [],
};
let run;
let subscription;
let failure;

try {
  await writeFile(join(consumer, editedRoute.path), editedRoute.source(false));

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

    return !titled;
  });

  let previous = withoutTitle;

  for (let index = 0; index < edits; index++) {
    const title = index % 2 === 0;
    let expected = withoutTitle;

    if (title) {
      expected = withTitle;
    }

    const before = await readFile(generatedPath, "utf8");

    if (before !== previous) {
      throw new Error(`routes.generated.ts changed before edit ${index + 1}`);
    }

    const started = performance.now();

    await writeFile(join(consumer, editedRoute.path), editedRoute.source(title));
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
      before: { bytes: Buffer.byteLength(before), sha256: sha256(before) },
      after: { bytes: Buffer.byteLength(expected), sha256: sha256(expected) },
    };

    result.edits.push(edit);
    console.log(JSON.stringify(edit));
    previous = expected;
    // A watch pass queued behind this one may still run; let it finish before the next edit.
    await delay(settleMs);
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
