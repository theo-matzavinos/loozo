import { createUrl, defineRoute, stringParam } from "@loozo/angular-router";

// #region catchall
const docs = defineRoute("docs/$segments[]", { params: { segments: stringParam } });

createUrl(docs, { params: { segments: ["guides", "setup"] } }); // "/docs/guides/setup"
createUrl(docs, { params: { segments: [] } }); // "/docs"
// #endregion catchall
