import { Component, Directive, signal } from "@angular/core";

/** Not a component, so it isn't what the demo runs. */
@Directive({ selector: "[fxCounted]" })
export class Counted {}

@Component({
  selector: "fx-counter",
  template: `<button (click)="count.set(count() + 1)">{{ count() }}</button>`,
})
export class Counter {
  readonly count = signal(0);
}
