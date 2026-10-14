import { Component, inject, type ApplicationConfig } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from "@angular/platform-browser";
import { HydrationUnit } from "./hydration-unit.js";

/** Use the same selected hydration configuration in genuine client and server bootstraps. */
export const incrementalHydrationConfig: ApplicationConfig = {
  providers: [provideClientHydration()],
};

/** Angular 22.2.2 supports an explicit eager-mode control with replay still enabled. */
export const eagerHydrationConfig: ApplicationConfig = {
  providers: [provideClientHydration(withNoIncrementalHydration(), withEventReplay())],
};

@Component({
  selector: "acceptance-incremental-hydration",
  imports: [HydrationUnit],
  template: `
    <h1>Incremental hydration</h1>
    <p>Hydrate B before A. C must remain dehydrated while its server identities stay unique.</p>
    @defer (hydrate on interaction) {
      <acceptance-hydration-unit label="A" />
    } @placeholder {
      <p>Block A placeholder for client-only navigation</p>
    }
    @defer (hydrate on interaction) {
      <acceptance-hydration-unit label="B" [dismissible]="dismissibleB" />
    } @placeholder {
      <p>Block B placeholder for client-only navigation</p>
    }
    @defer (hydrate on interaction) {
      <acceptance-hydration-unit label="C" [initiallyPresent]="false" />
    } @placeholder {
      <p>Block C placeholder for client-only navigation</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        color-scheme: dark;
        background: #141414;
        color: #eeeeee;
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }
    `,
  ],
})
export class IncrementalHydrationConsumer {
  /** `?dismissible=B`: the Popover Trigger replay case, with A and C still protected. */
  readonly dismissibleB = inject(ActivatedRoute).snapshot.queryParamMap.get("dismissible") === "B";
}
