import { Component, inject, input, linkedSignal, output, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
  injectOrigamiDialogOpener,
} from "@loozo/origami-ui/dialog";

type InvoiceSearchCriteria = { readonly invoiceNumber: string };

// The dialog: data comes in through inputs and leaves through an output; it closes itself
// through its own root.
@Component({
  selector: "app-invoice-search-dialog",
  imports: [OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogClose],
  hostDirectives: [OrigamiDialog],
  template: `
    <dialog ogDialogContent>
      <h2 ogDialogTitle>Search invoices</h2>
      <form (submit)="submit($event)">
        <label>
          Invoice number
          <input [value]="invoiceNumber()" (input)="setInvoiceNumber($event)" />
        </label>
        <button type="submit">Search</button>
        <button type="button" (click)="clear()">Clear</button>
      </form>
      <button ogDialogClose aria-label="Close">×</button>
    </dialog>
  `,
})
class InvoiceSearchDialog {
  readonly initialCriteria = input.required<InvoiceSearchCriteria>();
  readonly search = output<InvoiceSearchCriteria>();
  // Seeded once the required input is set: inputs aren't set during construction.
  readonly invoiceNumber = linkedSignal(() => this.initialCriteria().invoiceNumber);
  readonly #dialog = inject(OrigamiDialog);

  setInvoiceNumber(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.invoiceNumber.set(event.target.value);
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.#done({ invoiceNumber: this.invoiceNumber() });
  }

  clear(): void {
    this.#done({ invoiceNumber: "" });
  }

  #done(criteria: InvoiceSearchCriteria): void {
    this.search.emit(criteria);
    this.#dialog.open.set(false);
  }
}

// The page: one opener per dialog component, created in an injection context.
@Component({
  selector: "app-my-invoices",
  imports: [OrigamiButton],
  template: `
    <button ogButton (click)="openSearch()">Search invoices</button>
    <p>
      Invoice number: {{ searchCriteria().invoiceNumber || "any" }}, page {{ currentPage() + 1 }}
    </p>
  `,
})
export class MyInvoices {
  readonly searchCriteria = signal<InvoiceSearchCriteria>({ invoiceNumber: "" });
  readonly currentPage = signal(2);
  readonly #searchDialog = injectOrigamiDialogOpener(InvoiceSearchDialog);

  openSearch(): void {
    const criteria = this.searchCriteria();

    this.#searchDialog.open({
      initialCriteria: () => criteria,
      search: (next) => {
        this.searchCriteria.set(next);
        this.currentPage.set(0);
      },
    });
  }
}
