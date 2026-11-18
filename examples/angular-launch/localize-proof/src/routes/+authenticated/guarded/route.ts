import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";

export default defineRoute("guarded", { parent }).resolve({
  session: ({ remote }) => remote.session.current({ transferCache: false }),
});
