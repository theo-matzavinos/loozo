import {
  Component,
  DOCUMENT,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
  viewChildren,
} from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuGroup,
  OrigamiMenuGroupLabel,
  OrigamiMenuItem,
  OrigamiMenuSeparator,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";
import { MenuCheckable } from "./menu-checkable";
import { MenuLifecycle } from "./menu-lifecycle";
import { MenuPrecedenceExisting, MenuPrecedenceFactory } from "./menu-precedence";
import { MenuRowActions } from "./menu-row-actions";
import { MenuSubmenu } from "./menu-submenu";
import { MenuSubmenuLifecycle } from "./menu-submenu-lifecycle";

// Menu cases MN1–MN8, MN18 and MN20, MN9–MN15, MN17, MN19 and MN21 in the lifecycle sections,
// MN16 in the precedence section, MN23–MN29 in the checkable sections and MN33–MN46 in the
// submenu sections.
// Controls the tests use as script actions are buttons.

/** A helm-style item: the consumer's own directive composing `ogMenuItem` through `hostDirectives`. */
@Directive({
  selector: "button[appMenuItem]",
  hostDirectives: [
    { directive: OrigamiMenuItem, inputs: ["disabled", "label"], outputs: ["select"] },
  ],
  host: { class: "app-menu-item" },
})
export class AppMenuItem {}

function increment(value: number): number {
  return value + 1;
}

@Component({
  selector: "acceptance-menu-fixture",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuGroup,
    OrigamiMenuGroupLabel,
    OrigamiMenuSeparator,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    MenuRowActions,
    MenuLifecycle,
    MenuCheckable,
    MenuSubmenu,
    MenuSubmenuLifecycle,
    MenuPrecedenceFactory,
    MenuPrecedenceExisting,
    AppMenuItem,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach menu behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>File</h2>
      <button type="button" data-testid="before">Before</button>
      <div
        ogMenu
        #file="ogMenu"
        [(open)]="fileOpen"
        (openChange)="fileOpenOutputs.update(increment)"
      >
        <button ogMenuTrigger data-testid="file-trigger">File</button>
        <div ogMenuContent data-testid="file-content" class="menu" [gap]="4">
          <button ogMenuItem data-testid="file-new" (select)="record('new')">New</button>
          <button ogMenuItem data-testid="file-open" (select)="record('open')">Open</button>
          <button ogMenuItem data-testid="file-recent" (select)="record('recent')">
            Open recent
          </button>
          <button
            ogMenuItem
            disabled
            data-testid="file-save"
            (select)="record('save')"
            (click)="saveClicks.update(increment)"
          >
            Save
          </button>
          <button ogMenuItem data-testid="file-share" (select)="record('share')">Share</button>
          <button
            ogMenuItem
            label="Copy"
            data-testid="file-duplicate"
            (select)="record('duplicate')"
          >
            <span aria-hidden="true">⧉</span> Duplicate
          </button>
          <div ogMenuSeparator data-testid="file-separator"></div>
          <div ogMenuGroup data-testid="file-export">
            <span ogMenuGroupLabel data-testid="file-export-label">Export</span>
            <button ogMenuItem data-testid="file-pdf" (select)="record('pdf')">PDF</button>
            <button ogMenuItem data-testid="file-csv" (select)="record('csv')">CSV</button>
          </div>
        </div>
      </div>
      <button type="button" data-testid="after">After</button>
      <output data-testid="file-selected">{{ selections().join(",") }}</output>
      <output data-testid="file-state">{{ fileOpen() }} {{ file.state.open() }}</output>
      <output data-testid="file-open-outputs">{{ fileOpenOutputs() }}</output>
      <output data-testid="save-clicks">{{ saveClicks() }}</output>
      <button type="button" data-testid="open-file" (click)="fileOpen.set(true)">
        Open by model
      </button>
    </section>

    <section>
      <h2>Gated</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="gated-trigger">Gated</button>
        <div ogMenuContent #gated="ogMenuContent" data-testid="gated-content" class="menu">
          @if (gated.state.open()) {
            <button ogMenuItem data-testid="gated-first">First</button>
            <button ogMenuItem data-testid="gated-last">Last</button>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Rows</h2>
      <button type="button" data-testid="before-rows">Before rows</button>
      <table #rowsTable tabindex="-1" aria-label="Rows" data-testid="rows-table">
        <tbody>
          @for (row of rows(); track row) {
            <tr [attr.data-testid]="'row-' + row">
              <td>Row {{ row }}</td>
              <td>
                <acceptance-menu-row-actions
                  [row]="row"
                  (removed)="remove(row)"
                  (selected)="rowSelections.update(append($event))"
                />
              </td>
            </tr>
          }
        </tbody>
      </table>
      <button type="button" data-testid="after-rows">After rows</button>
      <output data-testid="rows">{{ rows().join(",") }}</output>
      <output data-testid="row-selected">{{ rowSelections().join(",") }}</output>
    </section>

    <section>
      <h2>Sort</h2>
      <button type="button" data-testid="before-sort">Before sort</button>
      <div ogMenu [(open)]="sortOpen">
        <button ogMenuTrigger data-testid="sort-trigger">Sort</button>
        <button type="button" data-testid="between-sort">Between</button>
        <div ogMenuContent data-testid="sort-content" class="menu">
          <button ogMenuItem data-testid="sort-name">Name</button>
          <button ogMenuItem data-testid="sort-date">Date</button>
          <button
            appMenuItem
            label="Size"
            data-testid="sort-size"
            (select)="sortSelected.set('size@' + focusedTestId())"
          >
            By size
          </button>
        </div>
      </div>
      <button type="button" data-testid="after-sort">After sort</button>
      <output data-testid="sort-open">{{ sortOpen() }}</output>
      <output data-testid="sort-selected">{{ sortSelected() }}</output>
    </section>

    <section>
      <h2>Nesting</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open dialog</button>
        <dialog ogDialogContent data-testid="dialog-content">
          <div ogMenu [(open)]="dialogMenuOpen">
            <button ogMenuTrigger data-testid="dialog-menu-trigger">Actions</button>
            <div ogMenuContent data-testid="dialog-menu-content" class="menu">
              <button ogMenuItem data-testid="dialog-menu-rename">Rename</button>
              <button ogMenuItem data-testid="dialog-menu-archive">Archive</button>
            </div>
          </div>
          <p data-testid="dialog-inside">Inside the dialog</p>
        </dialog>
      </div>
      <output data-testid="dialog-state">{{ dialogOpen() }} {{ dialogMenuOpen() }}</output>

      <div ogPopover [(open)]="popoverOpen">
        <button ogPopoverTrigger ogPopoverAnchor data-testid="popover-trigger">Filters</button>
        <div ogPopoverContent data-testid="popover-content" class="panel" [gap]="4">
          <div ogMenu [(open)]="popoverMenuOpen">
            <button ogMenuTrigger data-testid="popover-menu-trigger">Presets</button>
            <div ogMenuContent data-testid="popover-menu-content" class="menu">
              <button ogMenuItem data-testid="popover-menu-recent">Recent</button>
              <button ogMenuItem data-testid="popover-menu-starred">Starred</button>
            </div>
          </div>
          <p data-testid="popover-inside">Inside the popover</p>
        </div>
      </div>
      <output data-testid="popover-state">{{ popoverOpen() }} {{ popoverMenuOpen() }}</output>

      <div ogTooltip [(open)]="tipOpen" [openDelay]="0">
        <div ogMenu [(open)]="tipMenuOpen">
          <button ogMenuTrigger ogTooltipTrigger data-testid="tip-trigger" aria-label="More">
            ⋯
          </button>
          <div ogMenuContent data-testid="tip-menu-content" class="menu">
            <button ogMenuItem data-testid="tip-menu-pin">Pin</button>
          </div>
        </div>
        <div ogTooltipContent data-testid="tip-content" class="panel">More actions</div>
      </div>
      <output data-testid="tip-state">{{ tipOpen() }} {{ tipMenuOpen() }}</output>
    </section>

    <section>
      <h2>Deferred items</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="deferred-trigger">Deferred</button>
        <div ogMenuContent data-testid="deferred-content" class="menu">
          <button ogMenuItem data-testid="deferred-early">Early</button>
          @defer (hydrate when deferredHydrated()) {
            <button ogMenuItem data-testid="deferred-late-1">Late one</button>
            <button ogMenuItem data-testid="deferred-late-2">Late two</button>
            <output data-testid="deferred-block-attached">{{ attached() }}</output>
          }
        </div>
      </div>
      <div ogMenu>
        <button ogMenuTrigger data-testid="waiting-trigger">Waiting</button>
        <div ogMenuContent data-testid="waiting-content" class="menu">
          @defer (hydrate when deferredHydrated()) {
            <button ogMenuItem data-testid="waiting-first">First</button>
            <button ogMenuItem data-testid="waiting-second">Second</button>
          }
        </div>
      </div>
      <button type="button" data-testid="hydrate-deferred" (click)="deferredHydrated.set(true)">
        Hydrate the deferred items
      </button>
    </section>

    <acceptance-menu-lifecycle />

    <acceptance-menu-checkable />

    <acceptance-menu-submenu />
    <acceptance-menu-submenu-lifecycle />

    <section>
      <h2>Precedence</h2>
      <menu-precedence-factory />
      <menu-precedence-existing />
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
    .menu [role="separator"] {
      border-block-start: 1px solid #555555;
      margin-block: 4px;
    }
    .panel {
      color: inherit;
      background: #333333;
      border: 1px solid #777777;
      padding: 8px;
    }
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }
  `,
})
export class MenuFixture {
  protected readonly increment = increment;
  readonly attached = signal(false);

  readonly fileOpen = signal(false);
  readonly fileOpenOutputs = signal(0);
  readonly saveClicks = signal(0);
  /** `name@testid`: each activated item and what was focused while its `(select)` ran. */
  readonly selections = signal<readonly string[]>([]);

  readonly rows = signal<readonly number[]>([1, 2, 3]);
  readonly rowSelections = signal<readonly string[]>([]);
  readonly sortOpen = signal(false);
  readonly sortSelected = signal("");

  readonly dialogOpen = signal(false);
  readonly dialogMenuOpen = signal(false);
  readonly popoverOpen = signal(false);
  readonly popoverMenuOpen = signal(false);
  readonly tipOpen = signal(false);
  readonly tipMenuOpen = signal(false);

  readonly deferredHydrated = signal(false);

  readonly #document = inject(DOCUMENT);
  readonly #injector = inject(Injector);
  private readonly rowActions = viewChildren(MenuRowActions);
  private readonly rowsTable = viewChild.required<ElementRef<HTMLElement>>("rowsTable");

  protected record(name: string): void {
    this.selections.update(append(`${name}@${this.focusedTestId()}`));
  }

  protected focusedTestId(): string {
    return this.#document.activeElement?.getAttribute("data-testid") ?? "none";
  }

  protected append(entry: string): (entries: readonly string[]) => readonly string[] {
    return append(entry);
  }

  /**
   * The README's recipe: a confirmed deletion removes the row, its Trigger and its dialog, so
   * focus would fall to the body; once the row is gone, focus the next row's Trigger, the
   * previous one's after the last row, or the table when no row is left.
   */
  protected remove(row: number): void {
    const actions = this.rowActions();
    let index = -1;

    for (let position = 0; position < actions.length; position++) {
      if (actions[position].row() === row) {
        index = position;
      }
    }

    const next = actions[index + 1] ?? actions[index - 1] ?? null;
    const remaining: number[] = [];

    for (const current of this.rows()) {
      if (current !== row) {
        remaining.push(current);
      }
    }

    this.rows.set(remaining);
    afterNextRender(
      () => {
        if (next === null) {
          this.rowsTable().nativeElement.focus();

          return;
        }

        next.focusTrigger();
      },
      { injector: this.#injector },
    );
  }
}

function append(entry: string): (entries: readonly string[]) => readonly string[] {
  return (entries) => [...entries, entry];
}
