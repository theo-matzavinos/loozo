import { Component, signal } from "@angular/core";

/** Ordinary Angular setup smoke page. Contains no Origami implementation or acceptance proof. */
@Component({
  selector: "setup-readiness",
  template: `
    <h1>Origami rebuild setup</h1>
    <p>Dependency, build and SSR readiness only. No primitive implementation.</p>
    <button type="button" (click)="count.update(increment)">Verify Angular binding</button>
    <output aria-live="polite">{{ count() }}</output>
  `,
})
export class Readiness {
  readonly count = signal(0);
  readonly increment = (value: number): number => value + 1;
}
