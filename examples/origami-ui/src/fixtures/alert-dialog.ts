import { Component, Directive, Service, inject, input, model, output, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiAlertDialog,
  OrigamiAlertDialogOptions,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogDescription,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";

// AlertDialog cases Y16–Y18. Controls the tests use as script actions are buttons; a dialog's
// own controls sit inside it, since the rest of the page is inert while it's modal.

function increment(value: number): number {
  return value + 1;
}

/**
 * Y17: core-ui-lib's delete confirmation. The parent owns the request: Delete only emits
 * `confirm`, and the dialog stays open while it's pending and after it fails.
 */
@Component({
  selector: "delete-dialog",
  imports: [
    OrigamiAlertDialog,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
    OrigamiButton,
  ],
  template: `
    <div ogAlertDialog [(open)]="open" [dismissible]="!pending()">
      <dialog ogDialogContent data-testid="delete-content">
        <h2 ogDialogTitle>Delete {{ name() }}?</h2>
        <p ogDialogDescription>This can't be undone.</p>
        @if (error()) {
          <p data-testid="delete-error">{{ error() }}</p>
        }
        <button ogDialogClose autofocus [disabled]="pending()" data-testid="delete-cancel">
          Cancel
        </button>
        <button
          ogButton
          [disabled]="pending()"
          (click)="confirm.emit()"
          data-testid="delete-action"
        >
          Delete
        </button>
      </dialog>
    </div>
  `,
})
export class DeleteDialog {
  readonly open = model(false);
  readonly name = input.required<string>();
  readonly pending = input(false);
  readonly error = input("");
  readonly confirm = output<void>();
}

/** Y18: replacement AlertDialog Options with ordinary writable signals. */
@Service({ autoProvided: false })
export class AlertSettings {
  readonly open = signal(false);
  readonly dismissible = signal(false);
}

/** Y18: a consumer root whose factory Options contradict its exposed own inputs. */
@Directive({
  selector: "[factoryAlert]",
  hostDirectives: [
    { directive: OrigamiAlertDialog, inputs: ["open", "dismissible"], outputs: ["openChange"] },
  ],
  providers: [OrigamiAlertDialogOptions.provideFactory(() => inject(AlertSettings))],
})
export class FactoryAlert {}

/** Y18: an application component that is the AlertDialog root through `hostDirectives`. */
@Component({
  selector: "discard-confirmation",
  imports: [OrigamiDialogContent, OrigamiDialogTitle],
  hostDirectives: [{ directive: OrigamiAlertDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `
    <dialog ogDialogContent data-testid="hosted-content">
      <h2 ogDialogTitle>Discard draft?</h2>
      <button type="button" data-testid="hosted-discard" (click)="discard()">Discard</button>
      <output data-testid="hosted-state">{{ alert.state.open() }}</output>
    </dialog>
  `,
})
export class DiscardConfirmation {
  readonly alert = inject(OrigamiAlertDialog);

  discard(): void {
    this.alert.open.set(false);
  }
}

@Component({
  selector: "acceptance-alert-dialog-fixture",
  imports: [
    OrigamiAlertDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    DeleteDialog,
    FactoryAlert,
    DiscardConfirmation,
  ],
  providers: [AlertSettings],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach alert dialog behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Alert</h2>
      <div
        ogAlertDialog
        #alert="ogAlertDialog"
        [(open)]="alertOpen"
        [dismissible]="alertDismissible()"
        (openChange)="alertOutputs.update(increment)"
      >
        <button ogDialogTrigger data-testid="alert-trigger">Open alert</button>
        <dialog
          ogDialogContent
          #alertElement
          data-testid="alert-content"
          (cancel)="alertCancels.update(increment)"
        >
          <h2 ogDialogTitle data-testid="alert-title">Discard changes?</h2>
          <p ogDialogDescription data-testid="alert-description">Your edits will be lost.</p>
          <button type="button" data-testid="alert-action">Discard</button>
          <button ogDialogClose autofocus data-testid="alert-cancel">Keep editing</button>
          <div ogPopover [(open)]="alertPopoverOpen">
            <button ogPopoverTrigger ogPopoverAnchor data-testid="alert-popover-trigger">
              Details
            </button>
            <div
              ogPopoverContent
              class="panel"
              data-testid="alert-popover-content"
              role="group"
              aria-label="Details"
            >
              Unsaved edits
            </div>
          </div>
          <button
            type="button"
            data-testid="alert-open-popover"
            (click)="alertPopoverOpen.set(true)"
          >
            Open popover
          </button>
          <button
            type="button"
            data-testid="alert-dismissible"
            (click)="alertDismissible.set(!alertDismissible())"
          >
            Toggle dismissible
          </button>
          <button
            type="button"
            data-testid="alert-request-close"
            (click)="alertElement.requestClose()"
          >
            Request close
          </button>
          <output data-testid="alert-state"
            >{{ alert.state.open() }} {{ alert.state.dismissible() }}</output
          >
        </dialog>
      </div>
      <button type="button" data-testid="open-alert" (click)="alertOpen.set(true)">
        Open alert by model
      </button>
      <output data-testid="alert-open">{{ alertOpen() }}</output>
      <output data-testid="alert-outputs">{{ alertOutputs() }}</output>
      <output data-testid="alert-cancels">{{ alertCancels() }}</output>
    </section>

    <section>
      <h2>Delete</h2>
      <delete-dialog
        name="invoice"
        [(open)]="deleteOpen"
        [pending]="deletePending()"
        [error]="deleteError()"
        (confirm)="confirmDelete()"
      />
      <button type="button" data-testid="open-delete" (click)="deleteOpen.set(true)">
        Delete invoice
      </button>
      <button type="button" data-testid="fail-delete" (click)="failDelete()">Fail request</button>
      <button type="button" data-testid="succeed-delete" (click)="succeedDelete()">
        Succeed request
      </button>
      <output data-testid="delete-state"
        >{{ deleteOpen() }} {{ deletePending() }} {{ deleteConfirms() }}</output
      >
    </section>

    <section>
      <h2>Composition</h2>
      <div
        factoryAlert
        [open]="true"
        [dismissible]="true"
        (openChange)="factoryOutputs.update(increment)"
      >
        <dialog ogDialogContent data-testid="factory-content">
          <h2 ogDialogTitle>Factory alert</h2>
          <button ogDialogClose data-testid="factory-close">Close</button>
        </dialog>
      </div>
      <button type="button" data-testid="open-factory" (click)="settings.open.set(true)">
        Open factory
      </button>
      <output data-testid="factory-state">{{ settings.open() }} {{ factoryOutputs() }}</output>
      <discard-confirmation [(open)]="hostedOpen" />
      <button type="button" data-testid="open-hosted" (click)="hostedOpen.set(true)">
        Open hosted
      </button>
      <output data-testid="hosted-open">{{ hostedOpen() }}</output>
    </section>
  `,
  styles: `
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
    .panel {
      background: #333333;
      color: inherit;
      border: 1px solid #777777;
      padding: 8px;
    }
  `,
})
export class AlertDialogFixture {
  readonly settings = inject(AlertSettings);
  readonly increment = increment;
  readonly attached = signal(false);
  readonly alertOpen = signal(false);
  readonly alertDismissible = signal(true);
  readonly alertOutputs = signal(0);
  readonly alertCancels = signal(0);
  readonly alertPopoverOpen = signal(false);
  readonly deleteOpen = signal(false);
  readonly deletePending = signal(false);
  readonly deleteError = signal("");
  readonly deleteConfirms = signal(0);
  readonly factoryOutputs = signal(0);
  readonly hostedOpen = signal(false);

  confirmDelete(): void {
    this.deleteConfirms.update(increment);
    this.deleteError.set("");
    this.deletePending.set(true);
  }

  failDelete(): void {
    this.deletePending.set(false);
    this.deleteError.set("Couldn't delete the invoice.");
  }

  succeedDelete(): void {
    this.deletePending.set(false);
    this.deleteOpen.set(false);
  }
}
