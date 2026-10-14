import { Component } from "@angular/core";
import { HydrationUnit } from "./hydration-unit.js";

/** Kept in a separate file so eager references do not defeat the deferred fixture's lazy imports. */
@Component({
  selector: "acceptance-eager-hydration",
  imports: [HydrationUnit],
  template: `
    <h1>Eager hydration</h1>
    <acceptance-hydration-unit label="A" />
    <acceptance-hydration-unit label="B" />
    <acceptance-hydration-unit label="C" [initiallyPresent]="false" />
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
export class EagerHydrationConsumer {}
