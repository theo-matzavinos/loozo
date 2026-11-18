import { defineRoute } from "@loozo/angular-launch";
import { arrayParam, stringParam } from "@loozo/angular-router";
import parent from "../route";

// The anchor of the detail outlet, with a repeated search key and an encoded fragment.
export default defineRoute("products", {
  parent,
  search: { tag: arrayParam(stringParam) },
  fragments: ["über & (uns)"],
});
