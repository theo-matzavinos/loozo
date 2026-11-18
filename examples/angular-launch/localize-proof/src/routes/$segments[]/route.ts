import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../route";

// The root catchall: Angular SSR reads no outlet syntax, so a named-outlet URL renders only
// with it (the router's README, "Server rendering and hydration").
export default defineRoute("$segments[]", { parent, params: { segments: stringParam } });
