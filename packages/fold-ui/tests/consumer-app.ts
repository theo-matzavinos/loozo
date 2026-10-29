// The root component of the consumer check's app (consumer.mjs), using the components `add`
// copied with the prefix `zz`. consumer-smoke.mjs reads its ids.
import { Component, inject, signal } from "@angular/core";
import { FormField, disabled, email, form, required, submit } from "@angular/forms/signals";
import { OrigamiDialog, injectOrigamiDialogOpener } from "@loozo/origami-ui/dialog";
import { AlertDialogParts } from "#ui/alert-dialog";
import { Button, ButtonLink } from "#ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogParts,
  DialogTitle,
} from "#ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { Input } from "#ui/input";
import { Textarea } from "#ui/textarea";
import { LucideTriangleAlert } from "@lucide/angular";

// A dialog opened from code: the component is the Dialog root and closes itself.
@Component({
  selector: "app-search-dialog",
  imports: [Button, DialogContent, DialogFooter, DialogHeader, DialogTitle],
  hostDirectives: [Dialog],
  template: `
    <dialog zzDialogContent id="search-content" class="w-[min(640px,calc(100%-32px))]">
      <div zzDialogHeader>
        <h2 zzDialogTitle>Search invoices</h2>
      </div>
      <div zzDialogFooter>
        <button zzButton variant="primary" (click)="done()" id="search-done">Search</button>
      </div>
    </dialog>
  `,
})
export class SearchDialog {
  readonly #dialog = inject(OrigamiDialog);

  protected done(): void {
    this.#dialog.open.set(false);
  }
}

@Component({
  selector: "app-root",
  imports: [
    Button,
    ButtonLink,
    AlertDialogParts,
    DialogParts,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FormField,
    Input,
    LucideTriangleAlert,
    Textarea,
  ],
  template: `
    <main class="flex flex-wrap items-center gap-2 p-5">
      <button zzButton variant="primary" size="sm" id="sm">Small</button>
      <button zzButton variant="primary" id="md">Save</button>
      <button zzButton variant="primary" size="lg" id="lg">Large</button>
      <button zzButton variant="ghost" size="icon" aria-label="Alert" id="icon">
        <svg lucideTriangleAlert></svg>
      </button>
      <button zzButton disabled id="disabled">Disabled</button>
      <button zzButton variant="destructive" size="sm" id="destructive-sm">Small</button>
      <button zzButton variant="destructive" id="destructive-md">Delete</button>
      <button zzButton variant="destructive" size="lg" id="destructive-lg">Large</button>
      <button zzButton class="px-6" id="merged">Merged</button>
      <button zzButton class="rounded-checkbox" id="merged-radius">Merged radius</button>
      <button zzButton variant="primary" class="text-label" id="merged-text">Merged text</button>
      <a zzButton variant="link" href="/contracts" id="link">Contracts</a>
      <a zzButton variant="link" size="sm" href="/contracts" id="link-sm">Contracts</a>
      <a zzButton variant="link" size="lg" href="/contracts" id="link-lg">Contracts</a>
      <a zzButton variant="primary" href="/contracts/new" id="anchor">New contract</a>
      <p class="text-title" id="title-text">
        Contracts <span class="text-body" id="body-in-title">12 active</span>
      </p>
      <output id="terminations">{{ terminations() }}</output>

      <div zzAlertDialog [(open)]="open" [dismissible]="!pending()">
        <button zzAlertDialogTrigger variant="destructive" id="trigger">Terminate contract</button>
        <dialog zzAlertDialogContent id="content">
          <div zzAlertDialogHeader id="header">
            <div zzAlertDialogIcon><svg lucideTriangleAlert></svg></div>
            <h2 zzAlertDialogTitle id="title">Terminate contract LC-2041?</h2>
            <p zzAlertDialogDescription id="description">
              The final invoice is issued today. This can't be undone.
            </p>
          </div>
          <div zzAlertDialogFooter>
            <button zzAlertDialogCancel [disabled]="pending()" focusableWhenDisabled id="cancel">
              Cancel
            </button>
            <button
              zzButton
              variant="destructive"
              [disabled]="pending()"
              focusableWhenDisabled
              (click)="terminate()"
              id="action"
            >
              Terminate contract
            </button>
          </div>
        </dialog>
      </div>

      <div zzDialog [(open)]="editOpen" [dismissible]="!editPending()">
        <button zzDialogTrigger id="dialog-trigger">Edit contract</button>
        <dialog zzDialogContent id="dialog-content">
          <form class="contents" (submit)="saveContract($event)">
            <div zzDialogHeader>
              <h2 zzDialogTitle id="dialog-title">Edit contract</h2>
              <p zzDialogDescription>Changes apply from the next billing period.</p>
            </div>
            <div zzDialogBody class="grid gap-4">
              <div zzField>
                <label zzFieldLabel>Reference</label>
                <input zzInput autofocus [readOnly]="editPending()" id="dialog-reference" />
              </div>
            </div>
            <div zzDialogFooter>
              <button
                zzDialogClose
                [disabled]="editPending()"
                focusableWhenDisabled
                id="dialog-cancel"
              >
                Cancel
              </button>
              <button
                zzButton
                variant="primary"
                type="submit"
                [disabled]="editPending()"
                focusableWhenDisabled
                id="dialog-save"
              >
                Save
              </button>
            </div>
          </form>
        </dialog>
      </div>
      <output id="contract-saves">{{ contractSaves() }}</output>
      <button zzButton (click)="openSearch()" id="search-open">Search invoices</button>

      <!-- The root on the <dialog> itself. -->
      <button zzButton (click)="noteOpen.set(true)" id="note-open">Add note</button>
      <dialog zzDialog zzDialogContent [(open)]="noteOpen" id="note-content">
        <div zzDialogHeader>
          <h2 zzDialogTitle>Add note</h2>
        </div>
      </dialog>
      <button zzButton (click)="discardOpen.set(true)" id="discard-open">Discard draft</button>
      <dialog zzAlertDialog zzAlertDialogContent [(open)]="discardOpen" id="discard-content">
        <div zzAlertDialogHeader>
          <h2 zzAlertDialogTitle>Discard draft?</h2>
        </div>
        <div zzAlertDialogFooter>
          <button zzAlertDialogCancel>Keep editing</button>
        </div>
      </dialog>
    </main>

    <section class="grid w-80 gap-4 p-5">
      <div zzField #emailField="zzField" id="email-field">
        <label zzFieldLabel id="email-label">Email</label>
        <input
          zzInput
          type="email"
          [formField]="contact.email"
          placeholder="you@example.com"
          id="email"
        />
        <p zzFieldDescription id="email-description">We only use it for receipts.</p>
        @if (emailField.state.errorsShown()) {
          <p zzFieldError id="email-error">{{ emailField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzField>
        <label zzFieldLabel>Notes</label>
        <textarea zzTextarea rows="4" [formField]="contact.notes" id="notes"></textarea>
      </div>
      <div zzField id="account-field">
        <label zzFieldLabel id="account-label">Account</label>
        <input zzInput [formField]="contact.account" id="account" />
      </div>
      <input zzInput readonly value="LC-2041" aria-label="Contract" id="contract" />
      <input zzInput type="search" aria-label="Search" class="w-60 ps-8" id="search" />
      <div class="light">
        <input zzInput aria-label="Reference" id="light-input" />
      </div>
      <button zzButton variant="primary" (click)="save()" id="save">Save</button>
      <output id="saves">{{ saves() }}</output>
    </section>
  `,
})
export class App {
  protected readonly open = signal(false);
  protected readonly pending = signal(false);
  protected readonly terminations = signal(0);
  protected readonly saves = signal(0);
  protected readonly editOpen = signal(false);
  protected readonly editPending = signal(false);
  protected readonly contractSaves = signal(0);
  protected readonly noteOpen = signal(false);
  protected readonly discardOpen = signal(false);
  readonly #search = injectOrigamiDialogOpener(SearchDialog);
  protected readonly contact = form(
    signal({ email: "", notes: "", account: "ACC-0042" }),
    (path) => {
      required(path.email, { message: "Enter your email." });
      email(path.email, { message: "Enter a valid email." });
      disabled(path.account);
    },
  );

  protected async save(): Promise<void> {
    await submit(this.contact, async () => {
      this.saves.update((count) => count + 1);

      return undefined;
    });
  }

  protected saveContract(event: Event): void {
    event.preventDefault();

    // A focusable disabled submit button still submits, and so does Enter in a field.
    if (this.editPending()) {
      return;
    }

    this.contractSaves.update((count) => count + 1);
    this.editPending.set(true);
    setTimeout(() => {
      this.editPending.set(false);
      this.editOpen.set(false);
    }, 600);
  }

  protected openSearch(): void {
    this.#search.open();
  }

  protected terminate(): void {
    // A focusable disabled button still dispatches clicks.
    if (this.pending()) {
      return;
    }

    this.terminations.update((count) => count + 1);
    this.pending.set(true);
    setTimeout(() => {
      this.pending.set(false);
      this.open.set(false);
    }, 600);
  }
}
