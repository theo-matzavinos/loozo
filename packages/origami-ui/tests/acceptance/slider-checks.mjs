import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

// SL13 in Node: the Slider's package-private grid math, through its framework-free source, which
// no entry point exports. The searches run in a worker, so one that stops making progress fails
// this check after a bound instead of hanging it.
const math = pathToFileURL(resolve("slider/src/slider-math.ts")).href;
const bound = 10_000;

const worker = new Worker(
  `
    const { parentPort, workerData } = require("node:worker_threads");

    import(workerData).then((math) => {
      const decimal = math.sliderGrid(0, 1, 0.1);
      // Past 2^53 an index plus or minus one can round back to the same index.
      const huge = math.sliderGrid(0, 1e16, 1);
      const sparse = math.sliderGrid(0, 2 ** 56, 1);

      parentPort.postMessage({
        decimal: [
          math.valueAbove(decimal, 0.3),
          math.valueBelow(decimal, 0.3),
          math.valueAbove(decimal, 1),
          math.valueBelow(decimal, 0),
        ],
        huge: [huge.last, math.valueAbove(huge, 1e16), math.valueBelow(huge, 1e16)],
        sparse: [math.valueAbove(sparse, 2 ** 55), math.valueBelow(sparse, 2 ** 55)],
      });
    });
  `,
  { eval: true, workerData: math },
);
const timer = setTimeout(() => {
  void worker.terminate();
}, bound);
const [message] = await Promise.race([
  once(worker, "message"),
  once(worker, "exit").then(([code]) => {
    throw new Error(`The grid searches didn't finish within ${bound} ms (worker exit ${code}).`);
  }),
]);

clearTimeout(timer);
await worker.terminate();

assert.deepEqual(message.decimal, [0.4, 0.2, null, null], "ordinary decimal neighbours");
assert.deepEqual(
  message.huge,
  [1e16, null, 9999999999999998],
  "at 1e16 nothing representable lies above; below, the next representable allowed value",
);
assert.deepEqual(
  message.sparse,
  [null, null],
  "at 2^55 with step 1, no representable allowed value lies within reach either way",
);

console.log("Slider grid math checks passed.");
