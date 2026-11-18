import { defineRoute } from "@loozo/angular-router";

// A chat-outlet branch path with a catchall child: the child's group is never empty, so `[]` is valid.
export default defineRoute("files", { outlet: "chat" });
