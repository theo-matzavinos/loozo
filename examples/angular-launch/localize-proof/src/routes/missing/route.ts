import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";

// Its resolver's query answers notFound(): the not-found page renders here with 404.
export default defineRoute("missing", { parent }).resolve({
  missing: ({ remote }) => remote.probe.missing(),
});
