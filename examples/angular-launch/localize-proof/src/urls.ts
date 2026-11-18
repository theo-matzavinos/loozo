import { createUrl } from "@loozo/angular-router";
import { destination as account } from "./routes/account/$id/sign-in/destination.generated";
import { destination as anmelden } from "./routes/anmelden/destination.generated";
import { destination as chat } from "./routes/chat/$id/destination.generated";
import { destination as note } from "./routes/$note/destination.generated";
import { destination as products } from "./routes/products/destination.generated";
import { destination as productItem } from "./routes/products/item/$id/destination.generated";
import { destination as shelf } from "./routes/products/shelf/$rest[]/destination.generated";
import { destination as teamItem } from "./routes/teams/$team/item/$id/destination.generated";
import { destination as docsOld } from "./routes/docs/old/destination.generated";
import { destination as help } from "./routes/help/$topic[]/destination.generated";
import { destination as manualsStart } from "./routes/manuals/start/destination.generated";
import { destination as signIn } from "./routes/sign-in/destination.generated";

// The probe's targets as this build's own createUrl writes them. The server redirects to the
// same destinations with the same values (src/routes/route.ts).
export const ownUrls: Readonly<Record<string, () => string>> = {
  "sign-in": () => createUrl(signIn, {}),
  help: () => createUrl(help, { params: { topic: ["sign-in"] } }),
  account: () => createUrl(account, { params: { id: "sign-in" } }),
  "docs-old": () => createUrl(docsOld, {}),
  "manuals-start": () => createUrl(manualsStart, {}),
  anmelden: () => createUrl(anmelden, {}),
  // Named outlets: an outlet name is never a word, and values stay as they are.
  nested: () => createUrl(productItem, { params: { id: "3" } }),
  "root-branch": () => createUrl(chat, { params: { id: "7" } }),
  "root-branch-word": () => createUrl(chat, { params: { id: "chat" } }),
  "dynamic-anchor": () => createUrl(teamItem, { params: { team: "products", id: "item" } }),
  shelf: () => createUrl(shelf, { params: { rest: ["shelf", "item", "products"] } }),
  "shelf-empty": () => createUrl(shelf, { params: { rest: [] } }),
  encoded: () => createUrl(productItem, { params: { id: "a/b:c(d)e%f&g@h$i,j ä" } }),
  "no-static": () => createUrl(note, { params: { note: "chat" } }),
  // A primary value that looks like outlet syntax, and a repeated search key with a fragment.
  lookalike: () => createUrl(account, { params: { id: "(detail:item)" } }),
  query: () =>
    createUrl(products, { search: { tag: ["a", "b&c", "a", "ä"] }, fragment: "über & (uns)" }),
};
