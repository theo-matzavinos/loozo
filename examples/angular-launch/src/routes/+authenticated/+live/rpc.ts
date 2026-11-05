import { defineRpc } from "@loozo/angular-launch/server";
import type { Schema } from "@loozo/angular-launch/server";
import { signedIn } from "../../../auth.server";

interface TicksInput {
  readonly count: number;
  readonly everyMs: number;
  readonly fail: boolean;
}

const ticksSchema: Schema<TicksInput> = {
  "~standard": {
    version: 1,
    vendor: "live",
    validate(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("count" in value) ||
        typeof value.count !== "number" ||
        !("everyMs" in value) ||
        typeof value.everyMs !== "number" ||
        !("fail" in value) ||
        typeof value.fail !== "boolean"
      ) {
        return { issues: [{ message: "count, everyMs and fail required", path: [] }] };
      }

      return { value: { count: value.count, everyMs: value.everyMs, fail: value.fail } };
    },
  },
};

const nullSchema: Schema<null> = {
  "~standard": {
    version: 1,
    vendor: "live",
    validate(value) {
      if (value !== null) {
        return { issues: [{ message: "Expected null", path: [] }] };
      }

      return { value: null };
    },
  },
};

export default defineRpc(
  "live",
  ({ query, stream }) => ({
    snapshot: query({
      handler: ({ context }) => context.db.todos.snapshotForUser(context.user.id),
    }),

    // The user's todos now and after every change, until the caller goes away.
    watch: stream({
      handler: async function* ({ context, signal }) {
        yield* context.db.todos.watchForUser(context.user.id, signal);
      },
    }),

    // Loopback proof fixture: `count` values, then the end or a declared error.
    ticks: stream({
      input: ticksSchema,
      errors: {
        STOPPED: { status: 409, message: "The ticks stopped", data: nullSchema },
      },
      handler: async function* ({ context, input, signal, errors }) {
        context.stats.streamsStarted += 1;
        signal.addEventListener("abort", () => {
          context.stats.streamsAborted += 1;
        });

        try {
          for (let tick = 0; tick < input.count; tick += 1) {
            await new Promise((resolve) => setTimeout(resolve, input.everyMs));
            yield { tick, user: context.user.id };
          }

          if (input.fail) {
            throw errors.STOPPED(null);
          }
        } finally {
          context.stats.streamsReturned += 1;
        }
      },
    }),
  }),
  { use: [signedIn] },
);
