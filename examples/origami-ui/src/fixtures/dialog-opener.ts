import {
  Component,
  DestroyRef,
  Service,
  booleanAttribute,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { Location } from "@angular/common";
import {
  OrigamiAlertDialog,
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
  injectOrigamiDialogOpener,
} from "@loozo/origami-ui/dialog";
import type { WritableSignal } from "@angular/core";
import type { OrigamiDialogRef } from "@loozo/origami-ui/dialog";

// Dialog opener cases Y19–Y24. Mounted dialogs live in the document body, outside the page; the
// page's controls are script actions, since the rest of the page is inert while one is modal.

type Criteria = { readonly query: string };

function increment(value: number): number {
  return value + 1;
}

/**
 * What the page and the dialogs it opens report. The page provides it, and the dialogs inject it
 * through the caller's injector, their element injector's parent.
 */
@Service({ autoProvided: false })
export class OpenerLog {
  readonly destroyed = signal(0);
  readonly ownerCloses = signal(0);
  readonly confirmCloses = signal(0);
}

/** Y21: an application component that is an AlertDialog root, opened from inside another dialog. */
@Component({
  selector: "opener-confirm",
  imports: [OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogClose],
  hostDirectives: [OrigamiAlertDialog],
  template: `
    <dialog ogDialogContent data-testid="confirm-content">
      <h2 ogDialogTitle>Discard the search?</h2>
      <button ogDialogClose autofocus data-testid="confirm-keep">Keep</button>
      <button type="button" data-testid="confirm-discard" (click)="discard()">Discard</button>
    </dialog>
  `,
  styles: `
    dialog {
      color: #eeeeee;
      background: #2a2a2a;
      border: 1px solid #777777;
    }
  `,
})
export class OpenerConfirm {
  readonly discarded = output<void>();
  readonly #alert = inject(OrigamiAlertDialog);

  discard(): void {
    this.discarded.emit();
    this.#alert.open.set(false);
  }
}

/**
 * Y19–Y23: optima-leasing's `InvoiceSearchDialog`, opened from code. Data comes in through signal
 * inputs and a model and leaves through an output; the dialog closes itself through its own root.
 * Its template Help dialog is a root inside the top-level one, so it never claims the mount.
 */
@Component({
  selector: "opener-search-dialog",
  imports: [OrigamiDialog, OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogClose],
  hostDirectives: [OrigamiDialog],
  template: `
    <dialog ogDialogContent class="motion" data-testid="search-content">
      <h2 ogDialogTitle>Search invoices</h2>
      <form (submit)="submit($event)">
        <input data-testid="search-query" [value]="query()" (input)="setQuery($event)" />
        <button type="submit" data-testid="search-submit">Search</button>
      </form>
      <output data-testid="search-bindings"
        >{{ initialCriteria().query }} {{ limit() }} {{ dense() }} {{ page() }}
        {{ pageSize() }}</output
      >
      <button type="button" data-testid="search-next-page" (click)="page.set(page() + 1)">
        Next page
      </button>
      <button type="button" data-testid="search-discard" (click)="confirmDiscard()">Discard</button>
      <output data-testid="search-discards">{{ discards() }}</output>
      <button type="button" data-testid="search-help" (click)="helpOpen.set(true)">Help</button>
      <div ogDialog [(open)]="helpOpen">
        <dialog ogDialogContent data-testid="help-content">
          <h2 ogDialogTitle>Search help</h2>
          <button ogDialogClose data-testid="help-close">Close help</button>
        </dialog>
      </div>
      <form method="dialog">
        <button data-testid="search-native-close">Close natively</button>
      </form>
      <button ogDialogClose data-testid="search-close">Close</button>
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
      animation: opener-leave 300ms linear forwards;
    }
    @keyframes opener-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class OpenerSearchDialog {
  readonly initialCriteria = input.required<Criteria>();
  readonly limit = input(10);
  readonly dense = input(false, { transform: booleanAttribute });
  readonly page = model(0);
  readonly pageSize = input.required<number>({ alias: "size" });
  readonly search = output<Criteria>();
  // Seeded once the required input is set, not in a field initializer during construction.
  readonly query = linkedSignal(() => this.initialCriteria().query);
  readonly discards = signal(0);
  readonly helpOpen = signal(false);
  readonly #dialog = inject(OrigamiDialog);
  readonly #confirm = injectOrigamiDialogOpener(OpenerConfirm);

  constructor() {
    const log = inject(OpenerLog);

    inject(DestroyRef).onDestroy(() => log.destroyed.update(increment));
  }

  setQuery(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.query.set(event.target.value);
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.search.emit({ query: this.query() });
    this.#dialog.open.set(false);
  }

  confirmDiscard(): void {
    this.#confirm.open({ discarded: () => this.discards.update(increment) });
  }
}

/**
 * Y20: a dialog with a long exit, 1500 ms unless its owner types another, for its opener's owner to
 * be destroyed during it; its Related button asks the owner to open another through the same
 * opener, and Ask the page a confirmation through the owner's other opener; Filter changes only the
 * URL's query. Y24: it opens a confirmation through its own opener.
 */
@Component({
  selector: "opener-slow-dialog",
  imports: [OrigamiDialogContent, OrigamiDialogTitle],
  hostDirectives: [OrigamiDialog],
  template: `
    <dialog
      ogDialogContent
      class="slow"
      data-testid="slow-content"
      [style.animation-duration.ms]="exit()"
    >
      <h2 ogDialogTitle>Slow dialog</h2>
      <button type="button" data-testid="slow-confirm" (click)="confirm()">Discard</button>
      <button type="button" data-testid="slow-related" (click)="related.emit()">Related</button>
      <button type="button" data-testid="slow-ask-owner" (click)="askOwner.emit()">
        Ask the page
      </button>
      <button type="button" data-testid="slow-filter" (click)="filter()">Filter</button>
    </dialog>
  `,
  styles: `
    dialog {
      color: #eeeeee;
      background: #222222;
    }
    .slow[data-leaving] {
      animation: opener-slow-leave 1500ms linear forwards;
    }
    @keyframes opener-slow-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class OpenerSlowDialog {
  readonly #log = inject(OpenerLog);
  readonly #location = inject(Location);
  readonly #confirm = injectOrigamiDialogOpener(OpenerConfirm);
  readonly exit = input(1500);
  readonly related = output();
  readonly askOwner = output();

  filter(): void {
    this.#location.go("/dialog-opener?filtered");
  }

  async confirm(): Promise<void> {
    await this.#confirm.open().closed;
    this.#log.confirmCloses.update(increment);
  }
}

/**
 * Y23: a component whose one Dialog root is an element of its template, inside `@if`, so the root
 * can be destroyed while the component stays mounted.
 */
@Component({
  selector: "opener-conditional-dialog",
  imports: [OrigamiDialog, OrigamiDialogContent, OrigamiDialogTitle],
  template: `
    @if (shown()) {
      <div ogDialog>
        <dialog ogDialogContent data-testid="conditional-content">
          <h2 ogDialogTitle>Edit invoice</h2>
          <button type="button" data-testid="conditional-hide" (click)="shown.set(false)">
            Hide editor
          </button>
        </dialog>
      </div>
    }
  `,
  styles: `
    dialog {
      color: #eeeeee;
      background: #222222;
    }
  `,
})
export class OpenerConditionalDialog {
  readonly shown = signal(true);
}

/**
 * Y20: the owner of two openers, destroyed by the page. The slow dialog's opener is declared first,
 * so the owner's destruction disposes a slow dialog before the confirmation it asked for above it.
 */
@Component({
  selector: "opener-owner",
  template: `<output data-testid="owner-mounted">owner</output>`,
})
export class OpenerOwner {
  readonly #log = inject(OpenerLog);
  readonly #slow = injectOrigamiDialogOpener(OpenerSlowDialog);
  readonly #confirm = injectOrigamiDialogOpener(OpenerConfirm);
  #ref: OrigamiDialogRef | null = null;

  async open(exit = 1500): Promise<void> {
    const ref = this.#slow.open({
      exit: () => exit,
      related: () => void this.open(1000),
      askOwner: () => void this.#openConfirm(),
    });

    this.#ref = ref;
    await ref.closed;
    this.#log.ownerCloses.update(increment);
  }

  async #openConfirm(): Promise<void> {
    await this.#confirm.open().closed;
    this.#log.confirmCloses.update(increment);
  }

  close(): void {
    this.#ref?.close();
  }
}

@Component({
  selector: "acceptance-dialog-opener-fixture",
  imports: [OpenerOwner],
  providers: [OpenerLog],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach dialog opener behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Search</h2>
      <button type="button" data-testid="open-search" (click)="openSearch(true)">
        Search invoices
      </button>
      <button type="button" data-testid="open-search-one-way" (click)="openSearch(false)">
        Search invoices, page one-way
      </button>
      <button type="button" data-testid="close-search" (click)="closeSearch()">
        Close from outside
      </button>
      <button type="button" data-testid="bump" (click)="bump()">Next limit and page</button>
      <button type="button" data-testid="navigate" (click)="navigate()">Navigate</button>
      <button type="button" data-testid="await-again" (click)="awaitAgain()">
        Await closed again
      </button>
      <button type="button" data-testid="open-and-close" (click)="openAndClose()">
        Open and close at once
      </button>
      <output data-testid="search-state"
        >{{ criteria().query }} {{ page() }} {{ limit() }} {{ searches() }}</output
      >
      <output data-testid="search-closes"
        >{{ closes() }} {{ log.destroyed() }} {{ again() }}</output
      >
    </section>

    <section>
      <h2>Owner</h2>
      @if (ownerShown()) {
        <opener-owner />
      }
      <button type="button" data-testid="owner-open" (click)="owner()?.open()">Open slow</button>
      <button type="button" data-testid="owner-open-quick" (click)="owner()?.open(100)">
        Open slow with a short exit
      </button>
      <button type="button" data-testid="owner-close" (click)="owner()?.close()">Close slow</button>
      <button type="button" data-testid="destroy-owner" (click)="ownerShown.set(false)">
        Destroy owner
      </button>
      <button type="button" data-testid="restore-owner" (click)="ownerShown.set(true)">
        Restore owner
      </button>
      <output data-testid="owner-state">{{ ownerShown() }} {{ log.ownerCloses() }}</output>
      <output data-testid="owner-confirm-closes">{{ log.confirmCloses() }}</output>
    </section>

    <section>
      <h2>Effect</h2>
      <button type="button" data-testid="open-by-effect" (click)="effectRequests.update(increment)">
        Open from an effect
      </button>
      <output data-testid="effect-closes">{{ effectCloses() }}</output>
    </section>

    <section>
      <h2>Conditional root</h2>
      <button type="button" data-testid="open-conditional" (click)="openConditional()">
        Open the editor
      </button>
      <button type="button" data-testid="close-conditional" (click)="closeConditional()">
        Close the editor from outside
      </button>
      <output data-testid="conditional-closes">{{ conditionalCloses() }}</output>
    </section>

    <section>
      <h2>Retention</h2>
      <button type="button" data-testid="check-retained" (click)="checkRetained()">
        Check the closed reference
      </button>
      <output data-testid="retained">{{ retained() }}</output>
    </section>
  `,
})
export class DialogOpenerFixture {
  readonly log = inject(OpenerLog);
  readonly attached = signal(false);
  readonly criteria = signal<Criteria>({ query: "INV-1" });
  readonly page = signal(2);
  readonly limit = signal(10);
  readonly searches = signal(0);
  readonly closes = signal(0);
  readonly again = signal(0);
  readonly ownerShown = signal(true);
  readonly owner = viewChild(OpenerOwner);
  readonly effectRequests = signal(0);
  readonly effectCloses = signal(0);
  readonly conditionalCloses = signal(0);
  readonly retained = signal("unchecked");
  readonly increment = increment;
  readonly #location = inject(Location);
  readonly #searchDialog = injectOrigamiDialogOpener(OpenerSearchDialog);
  readonly #conditionalDialog = injectOrigamiDialogOpener(OpenerConditionalDialog);
  #search: OrigamiDialogRef | null = null;
  #conditional: OrigamiDialogRef | null = null;

  constructor() {
    // Y22: open() inside a reactive context, as when application state asks for a dialog.
    effect(() => {
      if (this.effectRequests() > 0) {
        void this.#openFromEffect();
      }
    });
  }

  async #openFromEffect(): Promise<void> {
    const ref = this.#searchDialog.open({
      initialCriteria: () => this.criteria(),
      pageSize: () => 25,
    });

    await ref.closed;
    this.effectCloses.update(increment);
  }

  async openConditional(): Promise<void> {
    const ref = this.#conditionalDialog.open();

    this.#conditional = ref;
    await ref.closed;
    this.conditionalCloses.update(increment);
  }

  closeConditional(): void {
    this.#conditional?.close();
  }

  checkRetained(): void {
    // Y19: the reference is the package-private mount, whose probe tells whether it still holds
    // anything of its component.
    const mount = this.#search as unknown as { readonly ɵholdsComponent: boolean } | null;

    if (mount === null) {
      this.retained.set("no reference");
    } else if (mount.ɵholdsComponent) {
      this.retained.set("retained");
    } else {
      this.retained.set("released");
    }
  }

  async openSearch(twoWay: boolean): Promise<void> {
    const criteria = this.criteria();
    let page: (() => number) | WritableSignal<number> = () => this.page();

    if (twoWay) {
      page = this.page;
    }

    const ref = this.#searchDialog.open({
      initialCriteria: () => criteria,
      limit: this.limit,
      dense: () => "",
      page,
      pageSize: () => 25,
      search: (next) => {
        this.criteria.set(next);
        this.searches.update(increment);
      },
    });

    this.#search = ref;
    await ref.closed;
    this.closes.update(increment);
  }

  closeSearch(): void {
    this.#search?.close();
  }

  bump(): void {
    this.limit.update(increment);
    this.page.update(increment);
  }

  navigate(): void {
    this.#location.go("/dialog-opener?navigated");
  }

  async awaitAgain(): Promise<void> {
    await this.#search?.closed;
    this.again.update(increment);
  }

  async openAndClose(): Promise<void> {
    const ref = this.#searchDialog.open({
      initialCriteria: () => this.criteria(),
      pageSize: () => 25,
    });

    ref.close();
    await ref.closed;
    this.closes.update(increment);
  }
}
