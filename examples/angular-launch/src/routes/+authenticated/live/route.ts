import { defineRoute } from "@loozo/angular-launch";
import type { Schema } from "@loozo/angular-launch/server";
import { titleSchema } from "../../../todo-input.server";
import parent from "../route";

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

// Streams and channels, which the page opens after hydration. `+authenticated`'s stage
// sends a call without a user to sign in, and narrows `user` for every procedure here. The
// page renders from a query on the server, then follows the stream in the browser.
export default defineRoute("live", { parent })
  .remote(({ query, stream, channel }) => ({
    live: {
      snapshot: query({
        handler: ({ context }) => context.db.todos.snapshotForUser(context.user.id),
      }),

      // The user's todos now and after every change, until the caller goes away.
      watch: stream({
        handler: async function* ({ context, signal }) {
          yield* context.db.todos.watchForUser(context.user.id, signal);
        },
      }),

      // The user's todos now, then again after each title the caller sends is added.
      add: channel({
        message: titleSchema,
        // Test-only: a cookie set before the handler goes on the upgrade's 101 response, and a
        // count of calls that ended, accepted or not.
        use: [
          async ({ context, response, next }) => {
            response.setCookie("proof-channel", context.user.id);

            try {
              return await next();
            } finally {
              context.stats.channelCallsSettled += 1;
            }
          },
        ],
        handler: async function* ({ context, messages, signal }) {
          context.stats.channelsStarted += 1;
          signal.addEventListener("abort", () => {
            context.stats.channelsAborted += 1;
          });

          try {
            yield await context.db.todos.snapshotForUser(context.user.id);

            for await (const { title } of messages) {
              await context.db.todos.addForUser(context.user.id, title);
              yield await context.db.todos.snapshotForUser(context.user.id);
            }
          } finally {
            context.stats.channelsReturned += 1;
          }
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
    },
  }))
  .resolve({
    todos: ({ remote }) => remote.live.snapshot(),
  });
