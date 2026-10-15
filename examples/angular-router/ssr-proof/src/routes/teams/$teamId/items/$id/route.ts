import { inject } from "@angular/core";
import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";
import { ItemCatalog } from "../../../../../catalog.js";

export default defineRoute("items/$id", {
  parent: team,
  params: { id: numberParam },
  runGuardsAndResolvers: "paramsOrQueryParamsChange",
  resolve: {
    item: ({ params, search }) => {
      const catalog = inject(ItemCatalog);

      return catalog({ teamId: params.teamId, id: params.id, score: search.score });
    },
  },
});
