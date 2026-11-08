import { defineRpc } from "@loozo/angular-launch/server";
import { titleLength } from "../../todo-input.server";

// Public reads that answer the same for everyone, so the about page can be prerendered.
export default defineRpc("about", ({ query }) => ({
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
}));
