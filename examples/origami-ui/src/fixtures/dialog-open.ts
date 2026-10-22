import { Component, signal } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogDescription,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";

// Y8: a Dialog requested open from the first render. It has its own route because the open
// dialog makes the rest of its page inert once it's modal.
@Component({
  selector: "acceptance-dialog-open-fixture",
  imports: [
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
  ],
  template: `
    <button type="button" data-testid="hydrate-open">Hydrate</button>
    <div ogDialog [(open)]="open">
      <button ogDialogTrigger data-testid="ssr-trigger">Open</button>
      <dialog ogDialogContent #content="ogDialogContent" data-testid="ssr-content">
        <h2 ogDialogTitle data-testid="ssr-title">Server-rendered dialog</h2>
        <p ogDialogDescription data-testid="ssr-description">Open from the first render.</p>
        @if (content.state.open()) {
          <p data-testid="ssr-child">Retained child</p>
        }
        <button ogDialogClose data-testid="ssr-close">Close</button>
      </dialog>
    </div>
    <output data-testid="ssr-open">{{ open() }}</output>
  `,
})
export class DialogOpenFixture {
  readonly open = signal(true);
}
