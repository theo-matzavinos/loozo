import { Component, signal } from "@angular/core";
import { OrigamiDialog, OrigamiDialogContent, OrigamiDialogTitle } from "@loozo/origami-ui/dialog";

// Y26: each Title waits in its own hydrate boundary while its Content hydrates with the fixture.
// It has its own route because a block still dehydrated keeps Angular's event replay walking
// every event's ancestors, which never ends in Y25's form whose controls shadow `parentNode`.
// The Contents are found by `id`: their naming changes as the fixture attaches, which node
// retention would report for a `data-testid`.
@Component({
  selector: "acceptance-dialog-split-fixture",
  imports: [OrigamiDialog, OrigamiDialogContent, OrigamiDialogTitle],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach fixture
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <p id="split-label">Split label</p>
    <div ogDialog>
      <dialog ogDialogContent id="split-content">
        @defer (hydrate when titlesHydrated()) {
          <h2 ogDialogTitle id="split-title">Split title</h2>
        } @placeholder {
          <p>Title</p>
        }
      </dialog>
    </div>
    <div ogDialog>
      <dialog ogDialogContent aria-labelledby="split-label" id="split-labelled-content">
        @defer (hydrate when titlesHydrated()) {
          <h2 ogDialogTitle id="split-labelled-title">Split title over a static label</h2>
        } @placeholder {
          <p>Title</p>
        }
      </dialog>
    </div>
    <button type="button" data-testid="hydrate-titles" (click)="titlesHydrated.set(true)">
      Hydrate the titles
    </button>
  `,
})
export class DialogSplitFixture {
  readonly attached = signal(false);
  readonly titlesHydrated = signal(false);
}
