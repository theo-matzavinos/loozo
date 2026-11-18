import { defineRoute } from "@loozo/angular-launch";
import { notFound, readCookies, redirect, type Schema } from "@loozo/angular-launch/server";
import { destination as account } from "./account/$id/sign-in/destination.generated";
import { destination as anmelden } from "./anmelden/destination.generated";
import { destination as chat } from "./chat/$id/destination.generated";
import { destination as note } from "./$note/destination.generated";
import { destination as products } from "./products/destination.generated";
import { destination as productItem } from "./products/item/$id/destination.generated";
import { destination as shelf } from "./products/shelf/$rest[]/destination.generated";
import { destination as teamItem } from "./teams/$team/item/$id/destination.generated";
import { destination as docsOld } from "./docs/old/destination.generated";
import { destination as help } from "./help/$topic[]/destination.generated";
import { destination as manualsStart } from "./manuals/start/destination.generated";
import { destination as signIn } from "./sign-in/destination.generated";

// The server builds every redirect canonically; the page's build puts its words in.
const redirects: Readonly<Record<string, () => Error>> = {
  "sign-in": () => redirect(signIn, {}),
  help: () => redirect(help, { params: { topic: ["sign-in"] } }),
  account: () => redirect(account, { params: { id: "sign-in" } }),
  "docs-old": () => redirect(docsOld, {}),
  "manuals-start": () => redirect(manualsStart, {}),
  anmelden: () => redirect(anmelden, {}),
  // Named outlets: an outlet name is never a word, and values stay as they are.
  nested: () => redirect(productItem, { params: { id: "3" } }),
  "root-branch": () => redirect(chat, { params: { id: "7" } }),
  "root-branch-word": () => redirect(chat, { params: { id: "chat" } }),
  "dynamic-anchor": () => redirect(teamItem, { params: { team: "products", id: "item" } }),
  shelf: () => redirect(shelf, { params: { rest: ["shelf", "item", "products"] } }),
  "shelf-empty": () => redirect(shelf, { params: { rest: [] } }),
  encoded: () => redirect(productItem, { params: { id: "a/b:c(d)e%f&g@h$i,j ä" } }),
  "no-static": () => redirect(note, { params: { note: "chat" } }),
  // A primary value that looks like outlet syntax, and a repeated search key with a fragment.
  lookalike: () => redirect(account, { params: { id: "(detail:item)" } }),
  query: () =>
    redirect(products, { search: { tag: ["a", "b&c", "a", "ä"] }, fragment: "über & (uns)" }),
};

const target: Schema<string> = {
  "~standard": {
    version: 1,
    vendor: "proof",
    validate(value) {
      if (typeof value !== "string" || !Object.hasOwn(redirects, value)) {
        return { issues: [{ message: "Unknown target", path: [] }] };
      }

      return { value };
    },
  },
};

// Test-only cookie identity: `proof-user` signs in.
export default defineRoute("", {})
  .context(({ request }) => ({ user: readCookies(request).get("proof-user") ?? null }))
  .remote(({ query }) => ({
    probe: {
      go: query({
        input: target,
        handler: ({ input }): null => {
          throw redirects[input]();
        },
      }),
      missing: query({
        handler: (): null => {
          throw notFound();
        },
      }),
    },
  }));
