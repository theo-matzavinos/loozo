import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";
export default defineRoute("uncached", { parent }).resolve({
  todos: ({ remote }) => remote.session.current({ transferCache: false }),
});
