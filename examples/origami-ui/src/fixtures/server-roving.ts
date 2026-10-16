import { Component } from "@angular/core";
import { RepeatedRoving } from "./repeated-roving.js";
import { SplitParts } from "./split-parts.js";

// SSR-only consumers rendered by tests/acceptance/ssr-checks.mjs; never imported by browser routes.

/** Repeated required-input items in every roving widget, and parts split across components. */
@Component({
  selector: "roving-app",
  imports: [RepeatedRoving, SplitParts],
  template: `
    <acceptance-repeated-roving label="ssr" />
    <acceptance-split-parts label="ssr" />
  `,
})
export class ServerRovingConsumer {}
