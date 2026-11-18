// Genuine destinations for redirect() in tests, defined the way a destination.generated.ts
// defines them. `translated` gives a German build's text for each local static segment.
import { defineDestination, numberParam, stringParam } from "@loozo/angular-router/_core";

export const root = defineDestination("", {}, "src/routes/route.ts");
export const signIn = defineDestination("sign-in", {}, "src/routes/sign-in/route.ts");
export const elsewhere = defineDestination("elsewhere", {}, "src/routes/elsewhere/route.ts");
export const todos = defineDestination("todos", {}, "src/routes/todos/route.ts");
export const todo = defineDestination(
  "todos/$id",
  { params: { id: numberParam }, fragments: ["title"] },
  "src/routes/todos/$id/route.ts",
);
export const signInNext = defineDestination(
  "sign-in",
  { search: { next: stringParam } },
  "src/routes/sign-in/route.ts",
);
export const account = defineDestination(
  "account/$id/sign-in",
  { params: { id: stringParam } },
  "src/routes/account/$id/sign-in/route.ts",
);
export const help = defineDestination(
  "help/$topic[]",
  { params: { topic: stringParam } },
  "src/routes/help/$topic[]/route.ts",
);
export const docs = defineDestination("docs", {}, "src/routes/docs/route.ts");
export const docsOld = defineDestination("old", { parent: docs }, "src/routes/docs/old/route.ts");
export const pathless = defineDestination(
  "",
  { parent: docs },
  "src/routes/docs/+pathless/route.ts",
);
export const special = defineDestination("(x)/ä", {}, "src/routes/(x)/ä/route.ts");

/** The sign-in destination as a German build defines it. */
export const signInGerman = defineDestination("sign-in", {}, "src/routes/sign-in/route.ts", [
  "anmelden",
]);
