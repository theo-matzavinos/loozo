import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestScope } from "../dist/server/dispatch.js";
import { application } from "./fixtures/application.mjs";
import { createResponseEffects } from "../dist/server/response-effects.js";
import { createStageRunner } from "../dist/server/stages.js";

function scope() {
  const controller = new AbortController();

  return { request: new Request("http://127.0.0.1/todos"), signal: controller.signal };
}

function counted(run, route = "src/routes/route.ts") {
  const stage = {
    runs: 0,
    route,
    run(args) {
      stage.runs += 1;

      return run(args);
    },
  };

  return stage;
}

test("a stage shared by two runs runs once, and both runs resolve to its context", async () => {
  for (const withRoot of [false, true]) {
    const runStages = createStageRunner(scope());
    const root = { run: () => ({ team: "core" }) };
    const shared = counted(({ context }) => ({ ...context, user: "alice" }));
    const chain = withRoot ? [root, shared] : [shared];

    const [first, second] = await Promise.all([
      runStages(chain, createResponseEffects().control),
      runStages(chain, createResponseEffects().control),
    ]);

    assert.equal(shared.runs, 1);
    assert.deepEqual(first, {
      context: withRoot ? { team: "core", user: "alice" } : { user: "alice" },
    });
    assert.equal(second, first);
  }
});

test("a rejecting or throwing stage runs once, and later runs settle to the same failure naming it", async () => {
  const rejected = new Error("rejected");
  const thrown = new Error("thrown");
  const rejecting = counted(async () => {
    throw rejected;
  });
  const throwing = counted(() => {
    throw thrown;
  });

  const root = { run: () => ({ user: "alice" }) };

  for (const withRoot of [false, true]) {
    for (const [stage, error] of [
      [rejecting, rejected],
      [throwing, thrown],
    ]) {
      const runStages = createStageRunner(scope());
      const chain = withRoot ? [root, stage] : [stage];

      stage.runs = 0;

      const first = await runStages(chain, createResponseEffects().control);
      const second = await runStages(chain, createResponseEffects().control);

      assert.equal(first.failed, stage);
      assert.equal(first.error, error);
      assert.equal(second, first);
      assert.equal(stage.runs, 1);
    }
  }
});

test("a stage's value is the context: a key it doesn't return is gone below it", async () => {
  const runStages = createStageRunner(scope());
  const seen = [];
  const parent = { run: () => ({ user: "alice", role: "reader" }) };
  const child = {
    run: ({ context }) => {
      seen.push(context);

      return { role: "admin", team: "core" };
    },
  };

  const { context } = await runStages([parent, child], createResponseEffects().control);

  assert.deepEqual(seen, [{ user: "alice", role: "reader" }]);
  assert.deepEqual(context, { role: "admin", team: "core" });
  assert.equal("user" in context, false);
});

test("a stage's value is kept as it is: a class instance keeps its methods, at any stage", async () => {
  class Session {
    user = "alice";

    signedIn() {
      return true;
    }
  }

  const runStages = createStageRunner(scope());
  const session = new Session();
  const root = { run: () => session };
  const child = { run: ({ context }) => context };

  const first = await runStages([root], createResponseEffects().control);
  const second = await runStages([root, child], createResponseEffects().control);

  assert.equal(first.context, session);
  assert.ok(first.context instanceof Session);
  assert.equal(first.context.signedIn(), true);
  assert.equal(second.context, session);
});

test("the first stage is called synchronously with the scope's request and signal, the run's response and an empty context", () => {
  const stageScope = scope();
  const runStages = createStageRunner(stageScope);
  const response = createResponseEffects().control;
  const calls = [];

  const result = runStages(
    [
      {
        run: (args) => {
          calls.push(args);

          return {};
        },
      },
    ],
    response,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].request, stageScope.request);
  assert.equal(calls[0].signal, stageScope.signal);
  assert.equal(calls[0].response, response);
  assert.deepEqual(calls[0].context, {});

  return result;
});

test("a longer chain reuses the memoized result of a stage it shares with an earlier run", async () => {
  const runStages = createStageRunner(scope());
  const root = counted(() => ({ user: "alice" }));
  const child = counted(({ context }) => ({ ...context, greeting: `hello ${context.user}` }));

  await runStages([root], createResponseEffects().control);
  const { context } = await runStages([root, child], createResponseEffects().control);

  assert.equal(root.runs, 1);
  assert.equal(child.runs, 1);
  assert.deepEqual(context, { user: "alice", greeting: "hello alice" });
});

test("each stage gets the response of the call that first reaches it, with overlapping calls", async () => {
  const runStages = createStageRunner(scope());
  const first = createResponseEffects().control;
  const second = createResponseEffects().control;
  const seen = { root: [], left: [], right: [] };
  const root = {
    run: ({ response }) => {
      seen.root.push(response);

      return { user: "alice" };
    },
  };
  const left = {
    run: ({ context, response }) => {
      seen.left.push(response);

      return { ...context, side: "left" };
    },
  };
  const right = {
    run: ({ context, response }) => {
      seen.right.push(response);

      return { ...context, side: "right" };
    },
  };

  const leftRun = runStages([root, left], first);
  const rightRun = runStages([root, right], second);
  const results = await Promise.all([leftRun, rightRun]);

  assert.deepEqual(
    results.map(({ context }) => context),
    [
      { user: "alice", side: "left" },
      { user: "alice", side: "right" },
    ],
  );
  assert.equal(seen.root.length, 1);
  assert.equal(seen.root[0], first);
  assert.equal(seen.left.length, 1);
  assert.equal(seen.left[0], first);
  assert.equal(seen.right.length, 1);
  assert.equal(seen.right[0], second);
});

test("a failure passes down unrelabelled: descendants settle to the failing stage's own result", async () => {
  const runStages = createStageRunner(scope());
  const thrown = new Error("root unreachable");
  const root = counted(() => {
    throw thrown;
  }, "src/routes/route.ts");
  const auth = counted(() => ({ user: "alice" }), "src/routes/+authenticated/route.ts");
  const own = counted(() => ({ list: [] }), "src/routes/+authenticated/todos/route.ts");

  const deep = await runStages([root, auth, own], createResponseEffects().control);
  const shallow = await runStages([root, auth], createResponseEffects().control);

  assert.equal(deep.failed, root);
  assert.equal(deep.error, thrown);
  assert.equal(shallow, deep);
  assert.deepEqual([root.runs, auth.runs, own.runs], [1, 0, 0]);
});

test("creating a request scope runs no stage", () => {
  let runs = 0;
  const app = application("stages", {
    context: () => {
      runs += 1;

      return {};
    },
    namespaces: { todos: { build: ({ query }) => ({ list: query({ handler: () => [] }) }) } },
  });

  createRequestScope(app, new Request("http://127.0.0.1/todos"));

  assert.equal(runs, 0);
});
