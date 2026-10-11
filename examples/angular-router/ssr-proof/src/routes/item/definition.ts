import { inject } from "@angular/core";
import { defineRoute } from "@loozo/angular-router";
import team from "../team/definition.js";
import { delayedNumber } from "../../codecs.js";
import { ItemCatalog } from "../../catalog.js";

export default defineRoute("items/$id", {
  parent: team,
  params: { id: delayedNumber },
  runGuardsAndResolvers: "paramsOrQueryParamsChange",
  resolve: {
    item: ({ params, search }) => {
      const catalog = inject(ItemCatalog);

      return catalog({ teamId: params.teamId, id: params.id, score: search.score });
    },
  },
});
