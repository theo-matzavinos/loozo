import { createUrl } from "@loozo/angular-router";
import { destination as account } from "./routes/account/$id/sign-in/destination.generated";
import { destination as anmelden } from "./routes/anmelden/destination.generated";
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
};
