import {
  ApplicationRef,
  Component,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { markMountStart } from "./bench-probe";
import { CheckboxList } from "./checkbox-list";
import { PlainList } from "./plain-list";
import { type ReadinessMode } from "./readiness";

// The mount routes: a server-rendered shell without the list. #bench-mount renders it once, timed;
// window.__benchCycle mounts and destroys it for the heap phase.
@Component({
  selector: "bench-mount",
  imports: [CheckboxList, PlainList],
  template: `
    <button id="bench-mount" type="button" (click)="mount()">Mount</button>
    @if (shown()) {
      @if (kind === "checkbox") {
        <bench-checkbox-list [readiness]="readiness()" />
      } @else {
        <bench-plain-list [readiness]="readiness()" />
      }
    }
  `,
})
export class Mount {
  readonly kind: "checkbox" | "plain" = inject(ActivatedRoute).snapshot.data["kind"];
  readonly shown = signal(false);
  readonly readiness = signal<ReadinessMode>("mount");
  readonly checkboxList = viewChild(CheckboxList);
  readonly plainList = viewChild(PlainList);
  readonly #app = inject(ApplicationRef);

  constructor() {
    afterNextRender(() => {
      window.__benchCycle = (mount) => {
        return this.cycle(mount);
      };
    });
  }

  mount(): void {
    markMountStart();
    this.shown.set(true);
  }

  async cycle(mount: boolean): Promise<void> {
    if (mount) {
      this.readiness.set("heap");
      this.shown.set(true);
      await this.#app.whenStable();

      return;
    }

    this.shown.set(false);
    await this.#app.whenStable();

    // A child query keeps the destroyed list until it's read again; the probe's results go too, so
    // nothing the bench adds outlives the list.
    this.checkboxList();
    this.plainList();
    window.__benchMount = undefined;
  }
}
