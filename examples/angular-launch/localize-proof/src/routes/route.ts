import { defineRoute } from "@loozo/angular-launch";
import { notFound, readCookies, redirect, type Schema } from "@loozo/angular-launch/server";
import { destination as account } from "./account/$id/sign-in/destination.generated";
import { destination as anmelden } from "./anmelden/destination.generated";
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
