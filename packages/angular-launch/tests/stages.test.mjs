import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestScope } from "../dist/server/dispatch.js";
import { createResponseEffects } from "../dist/server/response-effects.js";
import { createStageRunner } from "../dist/server/stages.js";

function scope() {
  const controller = new AbortController();

  return { request: new Request("http://127.0.0.1/todos"), signal: controller.signal };
}

function counted(run) {
  const stage = {
    runs: 0,
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
    const shared = counted(() => ({ user: "alice" }));
    const chain = withRoot ? [root, shared] : [shared];

    const [first, second] = await Promise.all([
      runStages(chain, createResponseEffects().control),
      runStages(chain, createResponseEffects().control),
    ]);

    assert.equal(shared.runs, 1);
    assert.deepEqual(first, withRoot ? { team: "core", user: "alice" } : { user: "alice" });
    assert.equal(second, first);
  }
});

test("a rejecting or throwing stage runs once, and later runs reject with the same error", async () => {
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
      await assert.rejects(runStages(chain, createResponseEffects().control), (reason) => {
        return reason === error;
      });
      await assert.rejects(runStages(chain, createResponseEffects().control), (reason) => {
        return reason === error;
      });
      assert.equal(stage.runs, 1);
    }
  }
});

test("a stage's value is spread over its parent's context, replacing the same key", async () => {
  const runStages = createStageRunner(scope());
  const seen = [];
  const parent = { run: () => ({ user: "alice", role: "reader" }) };
  const child = {
    run: ({ context }) => {
      seen.push(context);

      return { role: "admin", team: "core" };
    },
  };

  const context = await runStages([parent, child], createResponseEffects().control);

  assert.deepEqual(seen, [{ user: "alice", role: "reader" }]);
  assert.deepEqual(context, { user: "alice", role: "admin", team: "core" });
});

test("the first stage's value is spread over an empty context too", async () => {
  class Session {
    user = "alice";

    signedIn() {
      return true;
    }
  }

  const runStages = createStageRunner(scope());
  const session = new Session();

  const context = await runStages([{ run: () => session }], createResponseEffects().control);

  assert.notEqual(context, session);
  assert.equal(Object.getPrototypeOf(context), Object.prototype);
  assert.deepEqual(context, { user: "alice" });
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
  const child = counted(({ context }) => ({ greeting: `hello ${context.user}` }));

  await runStages([root], createResponseEffects().control);
  const context = await runStages([root, child], createResponseEffects().control);

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
    run: ({ response }) => {
      seen.left.push(response);

      return { side: "left" };
    },
  };
  const right = {
    run: ({ response }) => {
      seen.right.push(response);

      return { side: "right" };
    },
  };

  const leftRun = runStages([root, left], first);
  const rightRun = runStages([root, right], second);
  const contexts = await Promise.all([leftRun, rightRun]);

  assert.deepEqual(contexts, [
    { user: "alice", side: "left" },
    { user: "alice", side: "right" },
  ]);
  assert.equal(seen.root.length, 1);
  assert.equal(seen.root[0], first);
  assert.equal(seen.left.length, 1);
  assert.equal(seen.left[0], first);
  assert.equal(seen.right.length, 1);
  assert.equal(seen.right[0], second);
});

test("a request scope keeps the context factory's value by identity and its errors as is", async () => {
  class Session {
    user = "alice";
  }

  const request = new Request("http://127.0.0.1/todos");
  const values = [new Session(), Object.freeze({ user: "alice" }), undefined, 42];

  for (const value of values) {
    const application = { id: "stages", context: { create: () => value } };

    const scope = await createRequestScope(application, request);

    assert.equal(scope.value, value);
  }

  const thrown = new Error("thrown");
  const rejected = new Error("rejected");
  const throwing = {
    id: "stages",
    context: {
      create: () => {
        throw thrown;
      },
    },
  };
  const rejecting = {
    id: "stages",
    context: {
      create: async () => {
        throw rejected;
      },
    },
  };

  await assert.rejects(createRequestScope(throwing, request), (reason) => reason === thrown);
  await assert.rejects(createRequestScope(rejecting, request), (reason) => reason === rejected);
});
