import {
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { MenuContext, MenuRootOptions } from "./menu-context";

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiMenuOptions {
  /**
   * Writable requested open state; the direct model defaults to false. Opening from the Trigger,
   * activating an item, Escape, Tab and an outside click write it. External writes remain
   * authoritative; a menu opened by a write moves no focus. An opening that hasn't focused its item
   * yet is cancelled by a write after it, even a close and a reopen before the menu renders, by
   * focus moving elsewhere and by the menu's destruction. An `openChange` listener that closes and
   * reopens the menu inside the opening's own write keeps it.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Blocks opening from the Trigger and natively disables it; default false. Becoming true closes
   * an open menu; external writes, also while disabled, remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Menu Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuOptions> | AbstractType<OrigamiMenuOptions>,
  ): Provider {
    return { provide: OrigamiMenuOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Menu Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `open` and `disabled`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiMenuOptions): Provider {
    return { provide: OrigamiMenuOptions, useFactory: factory };
  }
}

/**
 * Locally provided readonly facade for the nearest Menu root, an `ogMenu` or an `ogMenuSub`; nested
 * roots have independent owners.
 */
@Service({ autoProvided: false })
export class OrigamiMenuState {
  readonly #context = inject(MenuContext);

  /**
   * Whether the menu is actually presented and interactive: the composed Popover's native
   * participation, not the requested `open`. False without Content, on the server and during an
   * exit.
   */
  readonly open: Signal<boolean> = this.#context.participating;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * Menu root: an action menu that opens from a Trigger button, the APG menu button pattern. Focus
 * moves into the menu: opening focuses the first item (the last with ArrowUp), arrows move focus
 * between the items and wrap, Home and End reach the ends and typing a character focuses the next
 * item it starts. Activating an item, by a click, Enter or Space, focuses the Trigger, closes the
 * menu and then emits the item's `(select)`, so a Dialog its listener opens returns focus to the
 * Trigger. Escape closes and focuses the Trigger; Tab and Shift+Tab close and move on from the
 * Trigger's place in the page.
 *
 * The root composes `ogPopover`, with `dismissible` fixed true, so the menu is a Popover: native
 * top layer, Escape and outside dismissal, nesting in a Dialog or Popover. Parts:
 * `ogMenuTrigger`, `ogMenuContent`, and inside Content `ogMenuItem` buttons, `ogMenuLink`
 * anchors, `ogMenuGroup` with `ogMenuGroupLabel`, `ogMenuSeparator`, checkable items and
 * `ogMenuSub` submenus. Activating an item in a submenu focuses this root's Trigger and closes the
 * whole tree. Consumers name an icon Trigger and own markup and styling.
 *
 * @example
 * ```html
 * <div ogMenu>
 *   <button ogMenuTrigger aria-label="Actions">⋯</button>
 *   <div ogMenuContent>
 *     <a ogMenuLink routerLink="edit">Edit</a>
 *     <div ogMenuSeparator></div>
 *     <button ogMenuItem (select)="remove()">Delete…</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMenu]",
  exportAs: "ogMenu",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiMenuOptions.provideExisting(() => OrigamiMenu),
    MenuRootOptions.provideFactory(() => inject(OrigamiMenuOptions)),
    MenuContext,
    OrigamiMenuState,
    // Popover's `open` writes, its Trigger's click opening and the dismissals, go through the
    // Context.
    OrigamiPopoverOptions.provideFactory(() => ({
      open: inject(MenuContext).popoverOpen,
      disabled: inject(MenuRootOptions).disabled,
      dismissible: computed(() => true),
    })),
  ],
})
export class OrigamiMenu implements OrigamiMenuOptions {
  /**
   * Own requested open-state model, default false; `openChange` emits the writes of opening,
   * activation and dismissal. Replaced Options supply the effective state instead.
   */
  readonly open = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; replaced Options supply
   * effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiMenuState);
}
