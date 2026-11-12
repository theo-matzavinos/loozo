import { Component, computed } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/destinations.generated.js";
import { destination as team } from "./routes/teams/$teamId/route.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/route.generated.js";

@Component({
  selector: "app-shell",
  imports: [RouterOutlet],
  template: `
    @if (teamId() !== undefined) {
      <nav>Team {{ teamId() }} <button (click)="next()">Next item</button></nav>
    }
    <router-outlet />
  `,
})
export default class Shell {
  // The deepest active route, or undefined before the first navigation.
  readonly active = injectActiveRoute();

  // An ancestor's params: number | undefined.
  readonly teamId = computed(
    () =>
      this.active()
        ?.chain.find((route) => route.is(team))
        ?.params().teamId,
  );

  // Before narrowing, params, search and data read as a union over every route.
  readonly params = computed(() => this.active()?.params());

  // Whether this route or one of its ancestors is the team route.
  readonly inTeam = computed(() => this.active()?.contains(team) ?? false);

  next() {
    const route = this.active();

    // is() narrows to the item's handle, so link and navigate are typed for it.
    if (route?.is(item)) {
      const { teamId, id } = route.params();

      void route.navigate({ params: { teamId, id: id + 1 }, replaceUrl: true });
    }
  }
}
