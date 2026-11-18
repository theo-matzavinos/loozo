import { defineRoute, enumParam } from "@loozo/angular-router";

export default defineRoute("products", { search: { sort: enumParam(["name", "price"]) } });
