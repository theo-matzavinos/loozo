import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../route";

// Its resolver redirects to the probe target: the navigation, or the SSR 302, follows it.
export default defineRoute("jump", { parent, search: { target: stringParam } }).resolve({
  jump: ({ remote, search }) => remote.probe.go(search.target ?? "", { transferCache: false }),
});
