import {
  ChangeDetectorRef,
  Component,
  Directive,
  Service,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuOptions,
  OrigamiMenuSub,
  OrigamiMenuSubOptions,
  OrigamiMenuSubTrigger,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

// Menu cases MN44 and MN45: submenus whose listeners and focus handlers replace parts of the tree.
// Tree's root and Branch's parent Sub are replaced by a descendant Sub's `openChange` listener while
// they close; Swap's second sub-trigger is replaced or removed by its own focus handler, which
// renders the change at once.
// Controls the tests use as script actions are buttons.

/** The consumer's writable Options, shared by every generation of Tree's root and Branch's Sub. */
@Service({ autoProvided: false })
export class MenuSubmenuTeardownSettings {
  readonly root = { open: signal(false), disabled: signal(false) };
  readonly sub = { open: signal(false), disabled: signal(false) };
}

/** A consumer root composing `ogMenu` and replacing its Options with the shared settings. */
@Directive({
  selector: "[treeMenu]",
  hostDirectives: [OrigamiMenu],
  providers: [OrigamiMenuOptions.provideFactory(() => inject(MenuSubmenuTeardownSettings).root)],
})
export class TreeMenu {}

/** A consumer Sub composing `ogMenuSub` and replacing its Options with the shared settings. */
@Directive({
  selector: "[branchSub]",
  hostDirectives: [OrigamiMenuSub],
  providers: [OrigamiMenuSubOptions.provideFactory(() => inject(MenuSubmenuTeardownSettings).sub)],
})
export class BranchSub {}

@Component({
  selector: "acceptance-menu-submenu-lifecycle",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuSub,
    OrigamiMenuSubTrigger,
    TreeMenu,
    BranchSub,
  ],
  providers: [MenuSubmenuTeardownSettings],
  template: `
    <section>
      <h2>Tree</h2>
      <ng-container #treeOutlet />
      <ng-template #treeGeneration let-generation>
        <div treeMenu>
          <button ogMenuTrigger [attr.data-testid]="'tree-trigger-' + generation">
            Tree {{ generation }}
          </button>
          <div ogMenuContent class="menu" [attr.data-testid]="'tree-content-' + generation">
            <div ogMenuSub (openChange)="replaceTree($event)">
              <button ogMenuSubTrigger [attr.data-testid]="'tree-sub-' + generation">Leaves</button>
              <div ogMenuContent class="menu" [attr.data-testid]="'tree-sub-content-' + generation">
                <button ogMenuItem>Leaf</button>
              </div>
            </div>
          </div>
        </div>
      </ng-template>
      <output data-testid="tree-open">{{ settings.root.open() }}</output>
      <button type="button" data-testid="arm-tree" (click)="armedTree = true">
        Replace the root when its submenu next closes
      </button>
      <button type="button" data-testid="disable-tree" (click)="settings.root.disabled.set(true)">
        Disable the root
      </button>
    </section>

    <section>
      <h2>Branch</h2>
      <div ogMenu [(open)]="branchOpen">
        <button ogMenuTrigger data-testid="branch-trigger">Branch</button>
        <div ogMenuContent class="menu" data-testid="branch-content">
          <button ogMenuItem data-testid="branch-first">First</button>
          <ng-container #branchOutlet />
          <ng-template #branchGeneration let-generation>
            <div branchSub>
              <button ogMenuSubTrigger [attr.data-testid]="'branch-sub-' + generation">
                Parent {{ generation }}
              </button>
              <div
                ogMenuContent
                class="menu"
                [attr.data-testid]="'branch-sub-content-' + generation"
              >
                <div ogMenuSub (openChange)="replaceBranch($event)">
                  <button ogMenuSubTrigger [attr.data-testid]="'branch-deep-' + generation">
                    Deep
                  </button>
                  <div
                    ogMenuContent
                    class="menu"
                    [attr.data-testid]="'branch-deep-content-' + generation"
                  >
                    <button ogMenuItem>Leaf</button>
                  </div>
                </div>
              </div>
            </div>
          </ng-template>
        </div>
      </div>
      <output data-testid="branch-open">{{ branchOpen() }} {{ settings.sub.open() }}</output>
      <button type="button" data-testid="arm-branch" (click)="armedBranch = true">
        Replace the parent Sub when its submenu next closes
      </button>
      <button type="button" data-testid="disable-branch" (click)="settings.sub.disabled.set(true)">
        Disable the parent Sub
      </button>
    </section>

    <section>
      <h2>Swap</h2>
      <div ogMenu [(open)]="swapOpen">
        <button ogMenuTrigger data-testid="swap-trigger">Swap</button>
        <div ogMenuContent class="menu" data-testid="swap-content">
          <div ogMenuSub [(open)]="swapFirstOpen">
            <button ogMenuSubTrigger data-testid="swap-first">First</button>
            <div ogMenuContent class="menu" data-testid="swap-first-content">
              <button ogMenuItem>One</button>
            </div>
          </div>
          <div
            ogMenuSub
            [(open)]="swapSecondOpen"
            (openChange)="swapChanges.set(swapChanges() + 1)"
          >
            @for (generation of swapGenerations(); track generation) {
              <button
                ogMenuSubTrigger
                [attr.data-testid]="'swap-second-' + generation"
                (focus)="swapOnFocus()"
              >
                Second {{ generation }}
              </button>
            }
            <div ogMenuContent class="menu" data-testid="swap-second-content">
              <button ogMenuItem>Two</button>
            </div>
          </div>
          <button ogMenuItem data-testid="swap-last">Last</button>
        </div>
      </div>
      <output data-testid="swap-state"
        >{{ swapOpen() }} {{ swapFirstOpen() }} {{ swapSecondOpen() }} {{ swapChanges() }}</output
      >
      <button type="button" data-testid="arm-swap-replace" (click)="swapMode = 'replace'">
        Replace the second sub-trigger when it's next focused
      </button>
      <button type="button" data-testid="arm-swap-remove" (click)="swapMode = 'remove'">
        Remove the second sub-trigger when it's next focused
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
    .menu [role^="menuitem"] {
      text-align: start;
      padding-block: 4px;
    }
    .menu [role^="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
  `,
})
export class MenuSubmenuLifecycle {
  readonly settings = inject(MenuSubmenuTeardownSettings);
  readonly branchOpen = signal(false);
  readonly swapOpen = signal(false);
  readonly swapFirstOpen = signal(false);
  readonly swapSecondOpen = signal(false);
  /** The generations of Swap's second sub-trigger rendered, one or none. */
  readonly swapGenerations = signal<readonly number[]>([1]);
  /** How many `openChange` outputs Swap's second Sub emitted. */
  readonly swapChanges = signal(0);
  /** Whether Tree's Sub's next close replaces the root. */
  protected armedTree = false;
  /** Whether Branch's deep Sub's next close replaces its parent Sub. */
  protected armedBranch = false;
  /** What the second sub-trigger's next focus does to it. */
  protected swapMode: "replace" | "remove" | null = null;

  private readonly treeOutlet = viewChild.required("treeOutlet", { read: ViewContainerRef });
  private readonly treeGeneration =
    viewChild.required<TemplateRef<{ $implicit: number }>>("treeGeneration");
  private readonly branchOutlet = viewChild.required("branchOutlet", { read: ViewContainerRef });
  private readonly branchGeneration =
    viewChild.required<TemplateRef<{ $implicit: number }>>("branchGeneration");
  /** The last generation mounted in each outlet. */
  readonly #generations = { tree: 0, branch: 0 };
  readonly #changeDetector = inject(ChangeDetectorRef);

  constructor() {
    afterNextRender(() => {
      this.#mountTree();
      this.#mountBranch();
    });
  }

  /**
   * Tree's Sub's `openChange`: once armed, its close destroys the root synchronously and mounts a
   * replacement sharing its Options, enabled, whose `open` is still true.
   */
  protected replaceTree(open: boolean): void {
    if (open || !this.armedTree) {
      return;
    }

    this.armedTree = false;
    this.settings.root.disabled.set(false);
    this.treeOutlet().clear();
    this.#mountTree();
  }

  /** Branch's deep Sub's `openChange`: the same for its parent Sub. */
  protected replaceBranch(open: boolean): void {
    if (open || !this.armedBranch) {
      return;
    }

    this.armedBranch = false;
    this.settings.sub.disabled.set(false);
    this.branchOutlet().clear();
    this.#mountBranch();
  }

  /** Once armed, the second sub-trigger's focus removes it, or replaces it, synchronously. */
  protected swapOnFocus(): void {
    const mode = this.swapMode;

    if (mode === null) {
      return;
    }

    this.swapMode = null;
    this.swapGenerations.update((generations) =>
      mode === "replace" ? generations.map((generation) => generation + 1) : [],
    );
    this.#changeDetector.detectChanges();
  }

  #mountTree(): void {
    this.#generations.tree += 1;
    this.treeOutlet().createEmbeddedView(this.treeGeneration(), {
      $implicit: this.#generations.tree,
    });
  }

  #mountBranch(): void {
    this.#generations.branch += 1;
    this.branchOutlet().createEmbeddedView(this.branchGeneration(), {
      $implicit: this.#generations.branch,
    });
  }
}
