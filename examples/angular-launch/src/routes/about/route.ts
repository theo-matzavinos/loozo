import { defineRoute } from "@loozo/angular-launch";
import { titleLength } from "../../todo-input.server";
import parent from "../route";

// Public reads that answer the same for everyone, so the about page can be prerendered.
export default defineRoute("about", { parent })
  .remote(({ query }) => ({
    about: {
      summary: query({
        handler: ({ context }) => ({
          name: "Personal todos",
          // Loopback proof diagnostics: when, and in which context, the answer was made.
          answeredAt: new Date().toISOString(),
          requestId: context.requestId,
        }),
      }),
      limits: query({
        handler: () => ({ titleLength }),
      }),
    },
  }))
  .resolve({
    summary: ({ remote }) => remote.about.summary(),
  });
