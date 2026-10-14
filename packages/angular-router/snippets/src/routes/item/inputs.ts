// Shows the handle's input types; the README embeds the region below.
/* oxlint-disable no-unused-expressions */

// #region inputs
import { injectRoute } from "./route.generated.js";

// injectRoute() needs an injection context, such as a component field initializer.
export function readInputs() {
  const route = injectRoute();

  route.params; // Resource<{ teamId: number; id: number } | undefined>
  route.search; // Resource<{ score?: number } | undefined>
  route.data; // Resource<{ item: Item } | undefined>, local resolver results only
}
// #endregion inputs
