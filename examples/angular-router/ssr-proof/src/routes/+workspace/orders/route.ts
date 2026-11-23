import {
  defineRoute,
  numberParam,
  remembered,
  retained,
  withFallback,
} from "@loozo/angular-router";
import workspace from "../route.js";
import { MissingResource } from "../../../missing-resource.js";

// The page size is retained by links and remembered between visits. Its rows and title read the
// page size, so they rerun when only the query changes, such as when the page size is cleared.
export default defineRoute("orders", {
  parent: workspace,
  search: { pageSize: retained(remembered(withFallback(numberParam, 20), "orders.pageSize")) },
})
  .runGuardsAndResolvers("paramsOrQueryParamsChange")
  .resolve({
    label: () => "orders",
    // The proof's stand-in for data that no longer exists at one page size.
    rows: ({ search }) => {
      if (search.pageSize === 99) {
        throw new MissingResource(`No page of ${search.pageSize} orders`);
      }

      return `${search.pageSize} rows`;
    },
  })
  .title(({ search }) => `Orders (${search.pageSize})`);
