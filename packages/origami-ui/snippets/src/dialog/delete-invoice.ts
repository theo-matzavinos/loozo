import { Component, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiAlertDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogDescription,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";

// Delete stays open while the request runs and after it fails; Cancel is the safe initial focus.
@Component({
  selector: "app-delete-invoice",
  imports: [
    OrigamiAlertDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
    OrigamiButton,
  ],
  template: `
    <div ogAlertDialog [(open)]="open" [dismissible]="!pending()">
      <button ogDialogTrigger>Delete invoice</button>
      <dialog ogDialogContent>
        <h2 ogDialogTitle>Delete invoice INV-0042?</h2>
        <p ogDialogDescription>This permanently deletes the invoice. This can't be undone.</p>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        <button ogDialogClose autofocus [disabled]="pending()">Cancel</button>
        <button ogButton [disabled]="pending()" (click)="delete()">
          @if (pending()) {
            Deleting…
          } @else {
            Delete
          }
        </button>
      </dialog>
    </div>
  `,
})
export class DeleteInvoice {
  readonly open = signal(false);
  readonly pending = signal(false);
  readonly error = signal("");
  #attempts = 0;

  delete(): void {
    this.pending.set(true);
    this.error.set("");

    // Stands in for a request; the first attempt fails.
    setTimeout(() => {
      this.#attempts += 1;
      this.pending.set(false);

      if (this.#attempts === 1) {
        this.error.set("Couldn't delete the invoice. Try again.");

        return;
      }

      this.open.set(false);
    }, 1000);
  }
}
