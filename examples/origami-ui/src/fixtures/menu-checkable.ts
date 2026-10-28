import {
  Component,
  DOCUMENT,
  Directive,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuCheckboxItem,
  OrigamiMenuCheckboxItemOptions,
  OrigamiMenuContent,
  OrigamiMenuGroup,
  OrigamiMenuGroupLabel,
  OrigamiMenuItem,
  OrigamiMenuRadioGroup,
  OrigamiMenuRadioGroupOptions,
  OrigamiMenuRadioItem,
  OrigamiMenuSeparator,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

// Menu cases MN23–MN31: checkbox and radio items in a table's "View" menu, a consumer's checkbox
// item and radio group composing the parts through `hostDirectives` with factory Options, and a
// menu whose listeners replace the activating item while it stays. Controls the tests use as
// script actions are buttons.

/** A consumer checkbox item whose `checked` is its own ordinary signal, not the composed model. */
@Directive({
  selector: "button[appViewPin]",
  exportAs: "appViewPin",
  hostDirectives: [OrigamiMenuCheckboxItem],
  providers: [
    OrigamiMenuCheckboxItemOptions.provideFactory(() => {
      const pin = inject(AppViewPin);

      return { checked: pin.pinned, disabled: signal(false), label: signal("Pin") };
    }),
  ],
})
export class AppViewPin {
  readonly pinned = signal(true);
}

/** A consumer radio group whose `value` is its own ordinary signal, not the composed model. */
@Directive({
  selector: "[appViewSort]",
  exportAs: "appViewSort",
  hostDirectives: [OrigamiMenuRadioGroup],
  providers: [
    OrigamiMenuRadioGroupOptions.provideFactory(() => ({ value: inject(AppViewSort).sort })),
  ],
})
export class AppViewSort {
  readonly sort = signal<string | null>("name");
}

/**
 * A consumer checkbox item whose `checked` is its component's `shared` signal, so an item that
 * replaces it reads and writes the same state.
 */
@Directive({
  selector: "button[appViewShared]",
  hostDirectives: [{ directive: OrigamiMenuCheckboxItem, outputs: ["select"] }],
  providers: [
    OrigamiMenuCheckboxItemOptions.provideFactory(() => ({
      checked: inject(MenuCheckable).shared,
      disabled: signal(false),
      label: signal(null),
    })),
  ],
})
export class AppViewShared {}

function increment(value: number): number {
  return value + 1;
}

@Component({
  selector: "acceptance-menu-checkable",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuCheckboxItem,
    OrigamiMenuRadioGroup,
    OrigamiMenuRadioItem,
    OrigamiMenuGroup,
    OrigamiMenuGroupLabel,
    OrigamiMenuSeparator,
    AppViewPin,
    AppViewSort,
    AppViewShared,
  ],
  template: `
    <section>
      <h2>View</h2>
      <div ogMenu #view="ogMenu" [(open)]="viewOpen">
        <button ogMenuTrigger data-testid="view-trigger">View</button>
        <div ogMenuContent data-testid="view-content" class="menu">
          <div ogMenuGroup data-testid="view-columns">
            <span ogMenuGroupLabel data-testid="view-columns-label">Columns</span>
            <button
              ogMenuCheckboxItem
              #owner="ogMenuCheckboxItem"
              label="Owner"
              data-testid="view-owner"
              [(checked)]="showOwner"
              (checkedChange)="change('owner')"
              (select)="selected('owner', showOwner())"
            >
              <span data-testid="view-owner-mark" aria-hidden="true">{{
                owner.state.checked() ? "✓" : "·"
              }}</span>
              Owner
            </button>
            <button
              ogMenuCheckboxItem
              data-testid="view-due"
              [(checked)]="showDue"
              (checkedChange)="change('due')"
              (select)="selected('due', showDue())"
            >
              Due date
            </button>
            <button
              ogMenuCheckboxItem
              disabled
              data-testid="view-archived"
              [(checked)]="showArchived"
              (checkedChange)="change('archived')"
              (select)="selected('archived', showArchived())"
              (click)="archivedClicks.update(increment)"
            >
              Archived
            </button>
          </div>
          <div ogMenuSeparator></div>
          <div
            ogMenuRadioGroup
            data-testid="view-density"
            [(value)]="density"
            (valueChange)="change('density')"
          >
            <span ogMenuGroupLabel data-testid="view-density-label">Density</span>
            <button
              ogMenuRadioItem
              #compact="ogMenuRadioItem"
              value="compact"
              label="Compact"
              data-testid="view-compact"
              (select)="selected('compact', density())"
            >
              <span data-testid="view-compact-mark" aria-hidden="true">{{
                compact.state.checked() ? "●" : "○"
              }}</span>
              Compact
            </button>
            <button
              ogMenuRadioItem
              value="comfortable"
              data-testid="view-comfortable"
              (select)="selected('comfortable', density())"
            >
              Comfortable
            </button>
            <button
              ogMenuRadioItem
              value="spacious"
              disabled
              data-testid="view-spacious"
              (select)="selected('spacious', density())"
              (click)="spaciousClicks.update(increment)"
            >
              Spacious
            </button>
          </div>
          <div ogMenuSeparator></div>
          <button ogMenuItem data-testid="view-reset" (select)="record('reset')">Reset</button>
        </div>
      </div>
      <button type="button" data-testid="view-after">After view</button>
      <output data-testid="view-values"
        >{{ showOwner() }} {{ showDue() }} {{ showArchived() }} {{ density() }}</output
      >
      <output data-testid="view-open">{{ viewOpen() }} {{ view.state.open() }}</output>
      <output data-testid="view-selected">{{ selections().join(",") }}</output>
      <output data-testid="view-changes">{{ changes().join(",") }}</output>
      <output data-testid="view-order">{{ order().join(",") }}</output>
      <output data-testid="archived-clicks">{{ archivedClicks() }}</output>
      <output data-testid="spacious-clicks">{{ spaciousClicks() }}</output>
      <button type="button" data-testid="view-write" (click)="write()">Write values</button>
    </section>

    <section>
      <h2>Wrapped checkables</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="wrapped-trigger">Wrapped</button>
        <div ogMenuContent data-testid="wrapped-content" class="menu">
          <button appViewPin #pin="appViewPin" data-testid="wrapped-pin">Pinned</button>
          <div appViewSort #sort="appViewSort" data-testid="wrapped-sort">
            <span ogMenuGroupLabel>Sort</span>
            <button ogMenuRadioItem value="name" data-testid="wrapped-name">Name</button>
            <button ogMenuRadioItem value="date" data-testid="wrapped-date">Date</button>
          </div>
        </div>
      </div>
      <output data-testid="wrapped-values">{{ pin.pinned() }} {{ sort.sort() }}</output>
    </section>

    <section>
      <h2>Remounted checkables</h2>
      <div ogMenu [(open)]="remountedOpen" (openChange)="closing($event)">
        <button ogMenuTrigger data-testid="remounted-trigger" (focus)="focusing()">
          Remounted
        </button>
        <div ogMenuContent data-testid="remounted-content" class="menu">
          <ng-container #sharedOutlet />
          <ng-template #sharedGeneration let-generation>
            <button
              appViewShared
              [attr.data-testid]="'remounted-shared-' + generation"
              (select)="remounted('shared')"
            >
              Shared {{ generation }}
            </button>
          </ng-template>
          <div ogMenuRadioGroup [(value)]="layout" (valueChange)="remounted('layout')">
            <span ogMenuGroupLabel>Layout</span>
            <button ogMenuRadioItem value="list" data-testid="remounted-list">List</button>
            <ng-container #gridOutlet />
            <ng-template #gridGeneration let-generation>
              <button
                ogMenuRadioItem
                value="grid"
                [attr.data-testid]="'remounted-grid-' + generation"
                (select)="remounted('grid')"
              >
                Grid {{ generation }}
              </button>
            </ng-template>
          </div>
        </div>
      </div>
      <output data-testid="remounted-values">{{ shared() }} {{ layout() }}</output>
      <output data-testid="remounted-log">{{ remountings().join(",") }}</output>
      <button type="button" data-testid="remount-on-focus" (click)="remountOn = 'focus'">
        Remount the items when the Trigger is next focused while open
      </button>
      <button type="button" data-testid="remount-on-close" (click)="remountOn = 'close'">
        Remount the items when the menu next closes
      </button>
    </section>
  `,
  styles: `
    .menu {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: 120px;
    }
    .menu:popover-open {
      display: flex;
      flex-direction: column;
    }
    .menu [role^="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
    .menu [role^="menuitem"][data-disabled] {
      opacity: 0.5;
    }
  `,
})
export class MenuCheckable {
  protected readonly increment = increment;

  readonly viewOpen = signal(false);
  readonly showOwner = signal(true);
  readonly showDue = signal(false);
  readonly showArchived = signal(false);
  readonly density = signal<string | null>("compact");
  readonly archivedClicks = signal(0);
  readonly spaciousClicks = signal(0);
  /** `name@testid@open`: each `(select)`, what was focused and the root's `open` while it ran. */
  readonly selections = signal<readonly string[]>([]);
  /** The same for each `checkedChange` and `valueChange`. */
  readonly changes = signal<readonly string[]>([]);
  /**
   * Both in the order they ran: `name.change`, and `name.select=state` with the checked state or
   * group value `(select)` read.
   */
  readonly order = signal<readonly string[]>([]);

  readonly remountedOpen = signal(false);
  /** Every generation of Remounted's Shared item reads and writes this. */
  readonly shared = signal(false);
  readonly layout = signal<string | null>("list");
  /** Remounted's `(select)` and `valueChange` runs, by name. */
  readonly remountings = signal<readonly string[]>([]);
  /** When Remounted's items are next remounted: on the Trigger's focus while open, or on closing. */
  protected remountOn: "focus" | "close" | null = null;

  readonly #document = inject(DOCUMENT);
  private readonly sharedOutlet = viewChild.required("sharedOutlet", { read: ViewContainerRef });
  private readonly sharedGeneration =
    viewChild.required<TemplateRef<{ $implicit: number }>>("sharedGeneration");
  private readonly gridOutlet = viewChild.required("gridOutlet", { read: ViewContainerRef });
  private readonly gridGeneration =
    viewChild.required<TemplateRef<{ $implicit: number }>>("gridGeneration");
  #generations = 0;

  constructor() {
    afterNextRender(() => this.#remount());
  }

  protected record(name: string): void {
    this.selections.update((entries) => [...entries, this.#observe(name)]);
  }

  protected selected(name: string, state: boolean | string | null): void {
    this.record(name);
    this.order.update((entries) => [...entries, `${name}.select=${state}`]);
  }

  protected change(name: string): void {
    this.changes.update((entries) => [...entries, this.#observe(name)]);
    this.order.update((entries) => [...entries, `${name}.change`]);
  }

  protected remounted(name: string): void {
    this.remountings.update((entries) => [...entries, name]);
  }

  /** Remounted Trigger's `focus`: Enter's activation focuses it while the menu is still open. */
  protected focusing(): void {
    if (this.remountOn === "focus" && this.remountedOpen()) {
      this.remountOn = null;
      this.#remount();
    }
  }

  /** Remounted's `openChange`. */
  protected closing(open: boolean): void {
    if (this.remountOn === "close" && !open) {
      this.remountOn = null;
      this.#remount();
    }
  }

  /** External writes: the bound state the items reflect. */
  protected write(): void {
    this.showOwner.set(false);
    this.showDue.set(true);
    this.density.set("comfortable");
  }

  /** Synchronously destroys Remounted's Shared and Grid items and creates the next generation. */
  #remount(): void {
    this.#generations++;
    this.sharedOutlet().clear();
    this.sharedOutlet().createEmbeddedView(this.sharedGeneration(), {
      $implicit: this.#generations,
    });
    this.gridOutlet().clear();
    this.gridOutlet().createEmbeddedView(this.gridGeneration(), { $implicit: this.#generations });
  }

  #observe(name: string): string {
    const focused = this.#document.activeElement?.getAttribute("data-testid") ?? "none";

    return `${name}@${focused}@${this.viewOpen()}`;
  }
}
