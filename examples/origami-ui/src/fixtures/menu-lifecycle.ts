import {
  Component,
  DOCUMENT,
  Directive,
  Service,
  TemplateRef,
  ViewContainerRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import type { WritableSignal } from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuOptions,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

// Menu cases MN9–MN15, MN17, MN19, MN21 and MN22: openings that haven't reached their item yet, a
// menu disabled while open, a menu destroyed by a focus handler, a close and reopen written before
// render, also by an `openChange` listener inside the opening, an item's focus handler moving focus
// elsewhere, a whole menu in a shadow root, an item that refuses focus, items in a shadow root
// inside Content, their order beside a light-DOM item, a blur that leaves one focused and an
// `openChange` listener moving focus out of an opening.
// Controls the tests click by script are buttons.

/** The consumer's writable Options, shared by every generation of the Teardown menu. */
@Service({ autoProvided: false })
export class MenuTeardownSettings {
  readonly open = signal(false);
  readonly disabled = signal(false);
}

/** A consumer root composing `ogMenu` and replacing its Options with the shared settings. */
@Directive({
  selector: "[teardownMenu]",
  hostDirectives: [OrigamiMenu],
  providers: [OrigamiMenuOptions.provideFactory(() => inject(MenuTeardownSettings))],
})
export class TeardownMenu {}

/** A consumer root composing `ogMenu` with its own writable Options, which it exposes. */
@Directive({
  selector: "[replacedMenu]",
  exportAs: "replacedMenu",
  hostDirectives: [OrigamiMenu],
  providers: [
    OrigamiMenuOptions.provideFactory(() => ({ open: signal(false), disabled: signal(false) })),
  ],
})
export class ReplacedMenu {
  readonly options = inject(OrigamiMenuOptions);
}

/** MN14: a whole menu and a control beside it in an open shadow root, its items arriving late. */
@Component({
  selector: "acceptance-menu-shadow",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiMenu, OrigamiMenuTrigger, OrigamiMenuContent, OrigamiMenuItem],
  template: `
    <div ogMenu>
      <button ogMenuTrigger data-testid="shadow-trigger">Shadow</button>
      <div ogMenuContent data-testid="shadow-content" class="menu">
        @if (items()) {
          <button ogMenuItem data-testid="shadow-first">First</button>
          <button ogMenuItem data-testid="shadow-last">Last</button>
        }
      </div>
    </div>
    <button type="button" data-testid="shadow-elsewhere">Elsewhere</button>
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
  `,
})
export class MenuShadow {
  readonly items = input(false);
}

/** MN17: two items in an open shadow root inside light-DOM Content, the second removable. */
@Component({
  selector: "acceptance-menu-shadow-items",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiMenuItem],
  template: `
    <button ogMenuItem data-testid="nested-alpha">Alpha</button>
    @if (bravo()) {
      <button ogMenuItem data-testid="nested-bravo">Bravo</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class MenuShadowItems {
  readonly bravo = input(true);
}

@Component({
  selector: "acceptance-menu-lifecycle",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    TeardownMenu,
    ReplacedMenu,
    MenuShadow,
    MenuShadowItems,
  ],
  providers: [MenuTeardownSettings],
  template: `
    <section>
      <h2>Mounting</h2>
      <div ogMenu #mountingMenu="ogMenu" [(open)]="mountingOpen">
        <button ogMenuTrigger #mountingTrigger data-testid="mounting-trigger">Mounting</button>
        @if (mountingContent()) {
          <div ogMenuContent data-testid="mounting-content" class="menu">
            <button ogMenuItem data-testid="mounting-first">First</button>
            <button ogMenuItem data-testid="mounting-last">Last</button>
          </div>
        }
      </div>
      <output data-testid="mounting-open">{{ mountingOpen() }}</output>
      <button
        type="button"
        data-testid="toggle-mounting-content"
        (click)="mountingContent.set(!mountingContent())"
      >
        Mount or remove Content
      </button>
      <button
        type="button"
        data-testid="reopen-mounting"
        (click)="reopen(mountingMenu.open, mountingContent)"
      >
        Close, reopen and mount Content
      </button>
      <button
        type="button"
        data-testid="escape-reopen-mounting"
        (click)="escapeAndReopen(mountingTrigger, mountingMenu.open, mountingContent)"
      >
        Escape on the Trigger, reopen and mount Content
      </button>
    </section>

    <section>
      <h2>Replaced</h2>
      <div replacedMenu #replaced="replacedMenu">
        <button ogMenuTrigger data-testid="replaced-trigger">Replaced</button>
        @if (replacedContent()) {
          <div ogMenuContent data-testid="replaced-content" class="menu">
            <button ogMenuItem data-testid="replaced-first">First</button>
            <button ogMenuItem data-testid="replaced-last">Last</button>
          </div>
        }
      </div>
      <output data-testid="replaced-open">{{ replaced.options.open() }}</output>
      <button
        type="button"
        data-testid="reopen-replaced"
        (click)="reopen(replaced.options.open, replacedContent)"
      >
        Close, reopen and mount Content
      </button>
    </section>

    <section>
      <h2>Restarting</h2>
      <div ogMenu #restartingMenu="ogMenu" (openChange)="restart($event, restartingMenu)">
        <button ogMenuTrigger data-testid="restarting-trigger">Restarting</button>
        @if (restartingContent()) {
          <div ogMenuContent data-testid="restarting-content" class="menu">
            <button ogMenuItem data-testid="restarting-first">First</button>
            <button ogMenuItem data-testid="restarting-last">Last</button>
          </div>
        }
      </div>
      <output data-testid="restarting-open">{{ restartingMenu.open() }}</output>
      <button type="button" data-testid="arm-restarting" (click)="restartOnce = true">
        Close and reopen on the next opening
      </button>
      <button type="button" data-testid="close-restarting" (click)="restartingMenu.open.set(false)">
        Close
      </button>
      <button
        type="button"
        data-testid="toggle-restarting-content"
        (click)="restartingContent.set(!restartingContent())"
      >
        Mount or remove Content
      </button>
    </section>

    <section>
      <h2>Redirect</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="redirect-trigger">Redirect</button>
        <div ogMenuContent data-testid="redirect-content" class="menu">
          <button ogMenuItem data-testid="redirect-first" (focus)="redirectTarget.focus()">
            First
          </button>
          <button ogMenuItem data-testid="redirect-second">Second</button>
        </div>
      </div>
      <button #redirectTarget type="button" data-testid="redirect-elsewhere">Elsewhere</button>
    </section>

    <section>
      <h2>Departing</h2>
      <div ogMenu [open]="departingOpen()" (openChange)="depart($event, departingElsewhere)">
        <button ogMenuTrigger data-testid="departing-trigger">Departing</button>
        @if (departingContent()) {
          <div ogMenuContent data-testid="departing-content" class="menu">
            @if (departingItems()) {
              <button ogMenuItem data-testid="departing-first">First</button>
              <button ogMenuItem data-testid="departing-last">Last</button>
            }
          </div>
        }
      </div>
      <button #departingElsewhere type="button" data-testid="departing-elsewhere">
        Elsewhere
      </button>
      <button type="button" data-testid="close-departing" (click)="departingOpen.set(false)">
        Close
      </button>
      <button
        type="button"
        data-testid="toggle-departing-content"
        (click)="departingContent.set(!departingContent())"
      >
        Mount or remove Content
      </button>
      <button
        type="button"
        data-testid="toggle-departing-items"
        (click)="departingItems.set(!departingItems())"
      >
        Mount or remove the items
      </button>
    </section>

    <section>
      <h2>Late items</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="late-trigger">Late</button>
        <div ogMenuContent data-testid="late-content" class="menu">
          @if (lateItems()) {
            <button ogMenuItem data-testid="late-first">First</button>
            <button ogMenuItem data-testid="late-second">Second</button>
          }
        </div>
      </div>
      @if (elsewhere()) {
        <button type="button" data-testid="elsewhere">Elsewhere</button>
      }
      <button type="button" data-testid="toggle-late-items" (click)="lateItems.set(!lateItems())">
        Mount or remove the items
      </button>
      <button type="button" data-testid="toggle-elsewhere" (click)="elsewhere.set(!elsewhere())">
        Mount or remove Elsewhere
      </button>
    </section>

    <section>
      <h2>Shadow</h2>
      <!-- Client-only: the shadow root isn't server-rendered. -->
      @if (shadowMounted()) {
        <acceptance-menu-shadow [items]="shadowItems()" />
      }
      <button
        type="button"
        data-testid="toggle-shadow-items"
        (click)="shadowItems.set(!shadowItems())"
      >
        Mount or remove the shadow items
      </button>
    </section>

    <section>
      <h2>Nested shadow</h2>
      <!-- Client-only: the shadow root isn't server-rendered. -->
      @if (shadowMounted()) {
        <button type="button" data-testid="nested-before">Before</button>
        <div ogMenu [(open)]="nestedOpen">
          <button ogMenuTrigger data-testid="nested-trigger">Nested</button>
          <div ogMenuContent data-testid="nested-content" class="menu">
            @for (part of nestedLayout(); track part) {
              @if (part === "zero") {
                <button ogMenuItem data-testid="nested-zero">Zero</button>
              } @else {
                <acceptance-menu-shadow-items [bravo]="nestedBravo()" />
              }
            }
          </div>
        </div>
        <button type="button" data-testid="nested-after">After</button>
      }
      <output data-testid="nested-open">{{ nestedOpen() }}</output>
      <button
        type="button"
        data-testid="toggle-nested-bravo"
        (click)="nestedBravo.set(!nestedBravo())"
      >
        Mount or remove Bravo
      </button>
      <button
        type="button"
        data-testid="nested-zero-first"
        (click)="nestedLayout.set(['zero', 'shadow'])"
      >
        Zero before the shadow items
      </button>
      <button
        type="button"
        data-testid="nested-zero-last"
        (click)="nestedLayout.set(['shadow', 'zero'])"
      >
        Zero after the shadow items
      </button>
    </section>

    <section>
      <h2>Refused</h2>
      <div ogMenu [(open)]="refusedOpen">
        <button ogMenuTrigger data-testid="refused-trigger">Refused</button>
        <div ogMenuContent data-testid="refused-content" class="menu">
          @if (refusedLoaded()) {
            <button ogMenuItem data-testid="refused-loaded">Loaded</button>
          }
          <button ogMenuItem hidden data-testid="refused-hidden">Unavailable until loaded</button>
        </div>
      </div>
      <output data-testid="refused-open">{{ refusedOpen() }}</output>
      <button
        type="button"
        data-testid="toggle-refused-loaded"
        (click)="refusedLoaded.set(!refusedLoaded())"
      >
        Mount or remove the loaded item
      </button>
    </section>

    <section>
      <h2>Disabling</h2>
      <div ogMenu [(open)]="disablingOpen" [disabled]="disablingRoot()">
        <button ogMenuTrigger data-testid="disabling-trigger" [disabled]="disablingTrigger()">
          Disabling
        </button>
        <div ogMenuContent data-testid="disabling-content" class="menu">
          <button ogMenuItem data-testid="disabling-first" (select)="record('first')">First</button>
        </div>
      </div>
      <output data-testid="disabling-open">{{ disablingOpen() }}</output>
      <button
        type="button"
        data-testid="toggle-disabling-root"
        (click)="disablingRoot.set(!disablingRoot())"
      >
        Disable or enable the Menu
      </button>
      <button
        type="button"
        data-testid="toggle-disabling-trigger"
        (click)="disablingTrigger.set(!disablingTrigger())"
      >
        Disable or enable the Trigger
      </button>
    </section>

    <section>
      <h2>Teardown</h2>
      <ng-container #teardownOutlet />
      <ng-template #teardownGeneration let-generation>
        <div teardownMenu>
          <button
            ogMenuTrigger
            [attr.data-testid]="'teardown-trigger-' + generation"
            (focus)="replaceOnFocus()"
          >
            Teardown {{ generation }}
          </button>
          <div ogMenuContent class="menu" [attr.data-testid]="'teardown-content-' + generation">
            <button
              ogMenuItem
              [attr.data-testid]="'teardown-item-' + generation"
              (select)="record('teardown-' + generation)"
            >
              Item
            </button>
          </div>
        </div>
      </ng-template>
      <output data-testid="teardown-open">{{ teardown.open() }}</output>
      <button type="button" data-testid="arm-teardown" (click)="armed = true">
        Replace the menu when its Trigger is next focused
      </button>
    </section>

    <output data-testid="lifecycle-selected">{{ selections().join(",") }}</output>
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
    .menu [role="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
  `,
})
export class MenuLifecycle {
  readonly mountingOpen = signal(false);
  readonly mountingContent = signal(false);
  readonly replacedContent = signal(false);
  readonly restartingContent = signal(false);
  readonly departingOpen = signal(false);
  readonly departingContent = signal(true);
  readonly departingItems = signal(true);
  readonly lateItems = signal(false);
  readonly elsewhere = signal(true);
  readonly shadowMounted = signal(false);
  readonly shadowItems = signal(false);
  readonly nestedOpen = signal(false);
  readonly nestedBravo = signal(true);
  /** Nested shadow Content's children in order: the shadow items, and Zero, a light-DOM item. */
  readonly nestedLayout = signal<readonly ("shadow" | "zero")[]>(["shadow"]);
  readonly refusedOpen = signal(false);
  readonly refusedLoaded = signal(false);
  readonly disablingOpen = signal(false);
  readonly disablingRoot = signal(false);
  readonly disablingTrigger = signal(false);
  readonly teardown = inject(MenuTeardownSettings);
  /** `name@testid`: each activated item and what was focused while its `(select)` ran. */
  readonly selections = signal<readonly string[]>([]);
  /** Whether the Teardown Trigger's next focus replaces the menu. */
  protected armed = false;
  /** Whether Restarting's next opening is closed and reopened by its `openChange` listener. */
  protected restartOnce = false;

  readonly #document = inject(DOCUMENT);
  private readonly outlet = viewChild.required("teardownOutlet", { read: ViewContainerRef });
  private readonly generation =
    viewChild.required<TemplateRef<{ $implicit: number }>>("teardownGeneration");
  #generations = 0;

  constructor() {
    afterNextRender(() => {
      this.#mount();
      this.shadowMounted.set(true);
    });
  }

  /** Writes the effective `open` false and then true and mounts Content, all before any render. */
  protected reopen(open: WritableSignal<boolean>, content: WritableSignal<boolean>): void {
    open.set(false);
    open.set(true);
    content.set(true);
  }

  /** Escape on the Trigger of a menu that isn't presented yet, which closes it, then `reopen`. */
  protected escapeAndReopen(
    trigger: HTMLElement,
    open: WritableSignal<boolean>,
    content: WritableSignal<boolean>,
  ): void {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    open.set(true);
    content.set(true);
  }

  /**
   * Restarting's `openChange`: once armed, an opening closes and reopens the menu through its
   * model, inside the opening's own write.
   */
  protected restart(open: boolean, menu: OrigamiMenu): void {
    if (!open || !this.restartOnce) {
      return;
    }

    this.restartOnce = false;
    menu.open.set(false);
    menu.open.set(true);
  }

  /** Departing's `openChange`: an opening moves focus to `elsewhere`, outside the menu. */
  protected depart(open: boolean, elsewhere: HTMLElement): void {
    this.departingOpen.set(open);

    if (open) {
      elsewhere.focus();
    }
  }

  protected record(name: string): void {
    const focused = this.#document.activeElement?.getAttribute("data-testid") ?? "none";

    this.selections.update((selections) => [...selections, `${name}@${focused}`]);
  }

  /**
   * Once armed, destroys the menu synchronously inside the Trigger's focus handler, which the
   * menu's activation and Tab run, and mounts a replacement sharing its `open`.
   */
  protected replaceOnFocus(): void {
    if (!this.armed) {
      return;
    }

    this.armed = false;
    this.outlet().clear();
    this.#mount();
  }

  #mount(): void {
    this.#generations += 1;
    this.outlet().createEmbeddedView(this.generation(), { $implicit: this.#generations });
  }
}
