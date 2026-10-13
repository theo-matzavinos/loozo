// Handwritten scope projection: no source discovery is implemented by this proof.
import type { Client } from "@loozo/angular-launch/server";
import type todos from "./todos";

export declare function injectRpc(): {
  readonly todos: Client<typeof todos>;
};
