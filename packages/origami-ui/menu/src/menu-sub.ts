import {
  DestroyRef,
  Directive,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { OrigamiMenuState } from "./menu";
import { MenuContext, MenuParent, MenuRootOptions } from "./menu-context";

/** Effective submenu configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiMenuSubOptions {
  /**
   * Writable requested open state; the direct model defaults to false. Opening from the
   * sub-trigger, the mouse resting on it, a sibling submenu opening, the parent menu closing, the
   * back arrow, Escape, Tab, an activation and an outside click write it. External writes remain
   * authoritative while the parent menu is open; one while it's closed is written back to false.
   * Writes made in one turn settle by their final values when effects run: of sibling submenus
   * written open then, the first in document order stays open, and one written open in the same
   * turn as its parent's close and reopen stays open.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Blocks opening from the sub-trigger, which stays focusable and reports itself disabled;
   * default false. Becoming true closes an open submenu.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces submenu Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuSubOptions> | AbstractType<OrigamiMenuSubOptions>,
  ): Provider {
    return { provide: OrigamiMenuSubOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all submenu Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `open` and `disabled`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiMenuSubOptions): Provider {
    return { provide: OrigamiMenuSubOptions, useFactory: factory };
  }
}

/**
 * A submenu: a nested Menu root inside a Menu's Content, with an `ogMenuSubTrigger`, an item of the
 * enclosing menu that opens it, and its own `ogMenuContent`, placed beside the sub-trigger. Its
 * Content holds the same parts as any menu's, nested submenus too.
 *
 * ArrowRight (ArrowLeft in right to left), Enter and Space on the sub-trigger open it on its first
 * item; ArrowLeft (ArrowRight in right to left) and Escape inside it close it and focus the
 * sub-trigger. A click on the sub-trigger opens it and leaves focus there; so does the mouse resting
 * on the sub-trigger for 100 ms, and while it's open, the mouse resting on another item of the
 * enclosing menu for 100 ms focuses that item and closes it, unless the mouse is heading for the
 * submenu. One submenu is open per menu, and arrows moving focus to another item close it.
 * Activating an item anywhere in the tree, Tab and an outside click close the whole tree, and
 * closing a menu closes its submenus, so reopening it starts with all of them closed.
 *
 * The Sub composes `ogPopover`, with `dismissible` fixed true, nested in its enclosing menu's. It
 * provides its own Menu State: its sub-trigger, its Content and the items inside it inject the Sub's,
 * not the enclosing menu's. Requires a nearest Menu root, `ogMenu` or another `ogMenuSub`.
 *
 * @example
 * ```html
 * <div ogMenuSub>
 *   <button ogMenuSubTrigger>Move to</button>
 *   <div ogMenuContent>
 *     <button ogMenuItem (select)="move('inbox')">Inbox</button>
 *     <button ogMenuItem (select)="move('archive')">Archive</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMenuSub]",
  exportAs: "ogMenuSub",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiMenuSubOptions.provideExisting(() => OrigamiMenuSub),
    MenuRootOptions.provideFactory(() => inject(OrigamiMenuSubOptions)),
    { provide: MenuParent, useFactory: () => inject(MenuContext, { skipSelf: true }) },
    MenuContext,
    OrigamiMenuState,
    // As the root's: Popover's `open` writes, the sub-trigger's click opening and the dismissals,
    // go through the Context.
    OrigamiPopoverOptions.provideFactory(() => ({
      open: inject(MenuContext).popoverOpen,
      disabled: inject(MenuRootOptions).disabled,
      dismissible: computed(() => true),
    })),
  ],
})
export class OrigamiMenuSub implements OrigamiMenuSubOptions {
  /**
   * Own requested open-state model, default false; `openChange` emits the submenu's opening and
   * closing writes. Replaced Options supply the effective state instead.
   */
  readonly open = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; replaced Options supply
   * effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This submenu's own readonly Menu State, shared with its sub-trigger and descendants. */
  readonly state = inject(OrigamiMenuState);

  readonly #context = inject(MenuContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers with the enclosing menu, which keeps one submenu open. */
  ngOnInit(): void {
    this.#context.registerSub(this.#destroyRef);
  }
}
