import { defineRoute } from "@loozo/angular-router";
import packageRoute from "../route.js";

// `api` is the symbol index, which the sidebar's API Index link opens.
export default defineRoute("", { parent: packageRoute, fragments: ["api"] });
