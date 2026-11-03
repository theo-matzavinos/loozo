import { Component, Service, inject, output, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiAlertDialog,
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
  injectOrigamiDialogOpener,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToaster,
  type OrigamiToastRecord,
} from "@loozo/origami-ui/toast";

// Toast cases TO8–TO10: toasts raised while a modal dialog blocks the page. A dialog's own
// controls sit inside it, since the rest of the page is inert while it's modal.

/** The fixture's toast data. */
export interface ModalToast {
  title: string;
}

@Service()
export class ModalToasts extends OrigamiToaster<ModalToast> {}

/**
 * The delete confirmation opened from code: Delete reports first, then requests close, in one
 * turn. After its exit the opener destroys it and removes its host.
 */
@Component({
  selector: "acceptance-toast-opened-delete",
  imports: [OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogClose, OrigamiButton],
  hostDirectives: [OrigamiAlertDialog],
  template: `
    <dialog ogDialogContent class="motion" data-testid="opened-delete-content">
      <h2 ogDialogTitle>Delete the invoice?</h2>
      <button ogDialogClose autofocus data-testid="opened-delete-cancel">Cancel</button>
      <button ogButton data-testid="opened-delete-action" (click)="delete()">Delete</button>
    </dialog>
  `,
  styles: `
    dialog {
      color: #eeeeee;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }

    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }

    .motion[data-leaving] {
      animation: opened-delete-leave 300ms linear forwards;
    }

    @keyframes opened-delete-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class ToastOpenedDelete {
  readonly deleted = output<void>();
  readonly #alert = inject(OrigamiAlertDialog);

  delete(): void {
    this.deleted.emit();
    this.#alert.open.set(false);
  }
}

@Component({
  selector: "acceptance-toast-modal-fixture",
  imports: [
    OrigamiToastRegion,
    OrigamiToast,
    OrigamiToastClose,
    OrigamiAlertDialog,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogClose,
    OrigamiButton,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach toast behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Delete</h2>
      <div ogAlertDialog [(open)]="deleteOpen">
        <button ogDialogTrigger data-testid="delete-trigger">Delete the invoice</button>
        <dialog ogDialogContent class="motion" data-testid="delete-content">
          <h2 ogDialogTitle>Delete the invoice?</h2>
          <button ogDialogClose autofocus data-testid="delete-cancel">Cancel</button>
          <button ogButton data-testid="delete-action" (click)="delete()">Delete</button>
        </dialog>
      </div>
    </section>

    <section>
      <h2>Editor</h2>
      <button type="button" data-testid="add" (click)="add('T')">Add 1000 ms</button>
      <div ogDialog [(open)]="editorOpen">
        <button ogDialogTrigger data-testid="editor-trigger">Edit</button>
        <dialog ogDialogContent data-testid="editor-content">
          <h2 ogDialogTitle>Editor</h2>
          <button type="button" data-testid="editor-add" (click)="add('E')">Copy</button>
          <div ogDialog [(open)]="nestedOpen">
            <button ogDialogTrigger data-testid="nested-trigger">Details</button>
            <dialog ogDialogContent data-testid="nested-content">
              <h2 ogDialogTitle>Details</h2>
              <button type="button" data-testid="nested-add" (click)="add('N')">Copy</button>
              <button ogDialogClose data-testid="nested-close">Close details</button>
            </dialog>
          </div>
          <button ogDialogClose data-testid="editor-close">Close the editor</button>
        </dialog>
      </div>
    </section>

    <section>
      <h2>Opened from code</h2>
      <button type="button" data-testid="opened-delete-open" (click)="openDelete()">
        Delete the invoice
      </button>
    </section>

    <section #removableSection>
      <h2>Removed</h2>
      <button
        type="button"
        data-testid="removable-open"
        (click)="showRemovable(removable, removableSection)"
      >
        Open a removable dialog
      </button>
      <dialog #removable data-testid="removable-content">
        <h2>Removable dialog</h2>
        <button type="button" data-testid="removable-add" (click)="add('R')">Copy</button>
        <button
          type="button"
          data-testid="removable-close-remove"
          (click)="removable.close(); removable.remove()"
        >
          Close and remove
        </button>
        <button type="button" data-testid="removable-remove" (click)="removable.remove()">
          Remove
        </button>
      </dialog>
    </section>

    <section>
      <h2>Native</h2>
      <button type="button" data-testid="native-open" (click)="native.showModal()">
        Open a native modal dialog
      </button>
      <dialog #native data-testid="native-content">
        <h2>Native dialog</h2>
        <button type="button" data-testid="native-add" (click)="add('X')">Copy</button>
        <button type="button" data-testid="native-close" (click)="native.close()">Close</button>
      </dialog>
    </section>

    <output data-testid="region-state">{{ titles(region.state.toasts()) }}</output>
    <section
      [ogToastRegion]="toasts"
      #region="ogToastRegion"
      aria-label="Notifications"
      data-testid="region"
    >
      <ol>
        @for (toast of region.state.toasts(); track toast.id) {
          <li
            [ogToast]="toast"
            #item="ogToast"
            [attr.data-testid]="'toast-' + toast.data.title"
            [attr.data-open]="item.state.open()"
          >
            {{ toast.data.title }}
            <button ogToastClose aria-label="Close">×</button>
          </li>
        }
      </ol>
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

    .motion[data-leaving] {
      animation: dialog-leave 300ms linear forwards;
    }

    @keyframes dialog-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class ToastModalFixture {
  readonly toasts = inject(ModalToasts);
  readonly attached = signal(false);
  readonly deleteOpen = signal(false);
  readonly editorOpen = signal(false);
  readonly nestedOpen = signal(false);
  readonly #counts = new Map<string, number>();
  readonly #deleteOpener = injectOrigamiDialogOpener(ToastOpenedDelete);

  titles(records: readonly OrigamiToastRecord<ModalToast>[]): string {
    const titles: string[] = [];

    for (const record of records) {
      titles.push(record.data.title);
    }

    return titles.join(" ");
  }

  add(prefix: string): void {
    this.toasts.add({ title: this.#next(prefix) }, { duration: 1000 });
  }

  /** core-ui-lib's delete flow: the toast first, then the close request, in one turn. */
  delete(): void {
    this.toasts.add({ title: this.#next("Deleted") }, { duration: 2000 });
    this.deleteOpen.set(false);
  }

  /** The delete flow through the opener: the toast as Delete reports, then its close request. */
  openDelete(): void {
    this.#deleteOpener.open({
      deleted: () => {
        this.toasts.add({ title: this.#next("Opened") }, { duration: 2000 });
      },
    });
  }

  /** Puts the dialog back into its section when a case removed it, then shows it modal. */
  showRemovable(dialog: HTMLDialogElement, section: HTMLElement): void {
    if (!dialog.isConnected) {
      section.append(dialog);
    }

    dialog.showModal();
  }

  #next(prefix: string): string {
    const count = (this.#counts.get(prefix) ?? 0) + 1;

    this.#counts.set(prefix, count);

    return `${prefix}${count}`;
  }
}
