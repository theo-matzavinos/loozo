import { defineRoute, enumParam, remembered } from "@loozo/angular-router";

// The layout is remembered per tab (session storage): a server-rendered page shows the default
// until the browser restores it.
export default defineRoute("products", {
  search: {
    sort: enumParam(["name", "price"]),
    view: remembered(enumParam(["grid", "table"]), "products.view"),
  },
});
