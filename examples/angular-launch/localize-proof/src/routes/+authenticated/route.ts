import { defineRoute } from "@loozo/angular-launch";
import { redirect, type Schema } from "@loozo/angular-launch/server";
import parent from "../route";
import { destination as signIn } from "../sign-in/destination.generated";

const text: Schema<string> = {
  "~standard": {
    version: 1,
    vendor: "proof",
    validate(value) {
      if (typeof value !== "string") {
        return { issues: [{ message: "Text required", path: [] }] };
      }

      return { value };
    },
  },
};

// A signed-out call below this route is sent to sign in.
export default defineRoute("", { parent })
  .context(({ context }) => {
    if (context.user === null) {
      throw redirect(signIn, {});
    }

    return { ...context, user: context.user };
  })
  .remote(({ query, stream, channel }) => ({
    session: {
      current: query({ handler: ({ context }) => ({ user: context.user }) }),
      ticks: stream({
        handler: async function* ({ context }) {
          yield context.user;
        },
      }),
      echo: channel({
        message: text,
        handler: async function* ({ messages }) {
          for await (const message of messages) {
            yield message;
          }
        },
      }),
    },
  }));
