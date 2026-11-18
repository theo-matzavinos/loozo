import { defineRoute, stringParam } from "@loozo/angular-router";

// The root not-found page; Angular SSR needs it to render named-outlet URLs at all.
export default defineRoute("$segments[]", { params: { segments: stringParam } });
