import { Directive, booleanAttribute, inject, input } from "@angular/core";
import {
  OrigamiMenuState,
  OrigamiMenuTrigger,
  OrigamiMenuTriggerOptions,
} from "@loozo/origami-ui/menu";
import { OrigamiPopoverTrigger } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { ToolbarControlContent, ɵOrigamiToolbarControl } from "./toolbar-control";

/**
 * A Menu Trigger that is one control in the nearest Toolbar, with the inputs, Options and
 * behavior of `OrigamiMenuTrigger` and the roving focus of `ogToolbarItem`: it shares the
 * Toolbar's tab stop and arrow sequence in DOM order, and keeps the tab stop while focus is in
 * its own menu, its submenus included, so Tab and Shift+Tab out of the open menu continue from
 * the Trigger's place, past the Toolbar's other controls.
 *
 * The Toolbar's keys win on its axis: in a horizontal Toolbar ArrowLeft, ArrowRight, Home and End
 * move between controls and ArrowDown and ArrowUp open the menu on its first or last item; in a
 * vertical Toolbar ArrowDown and ArrowUp move between controls and don't open it, which Enter,
 * Space and a click still do. The Toolbar ignores Shift-modified arrows, so Shift+ArrowDown and
 * Shift+ArrowUp still open the menu, as on `ogMenuTrigger`. A click focuses the Trigger first and
 * then opens or closes the menu, which focuses its first item once it is shown. Its disabled state
 * in the Toolbar is the Trigger's own: the Menu's or its own disabled, so disabling the Menu root
 * also takes it out of the arrow sequence unless `focusableWhenDisabled`. Requires a nearest
 * Toolbar and a nearest Menu; don't also apply `ogMenuTrigger` or another button primitive.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <button ogToolbarItem (click)="undo()">Undo</button>
 *   <div ogMenu>
 *     <button ogToolbarMenuTrigger>More</button>
 *     <div ogMenuContent>
 *       <button ogMenuItem (select)="clear()">Clear formatting</button>
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogToolbarMenuTrigger]",
  exportAs: "ogToolbarMenuTrigger",
  // The Toolbar control comes first, so its keydown takes the Toolbar's axis keys and prevents
  // their default before the Menu Trigger's keydown, which ignores keys already prevented.
  hostDirectives: [ɵOrigamiToolbarControl, OrigamiMenuTrigger],
  providers: [
    OrigamiMenuTriggerOptions.provideExisting(() => OrigamiToolbarMenuTrigger),
    {
      provide: ToolbarControlContent,
      useFactory: (): ToolbarControlContent => ({
        hasFocus: inject(OrigamiPopoverTrigger, { self: true }).ɵcontentHasFocus,
      }),
    },
  ],
})
export class OrigamiToolbarMenuTrigger implements OrigamiMenuTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("toolbar-menu-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** The Menu root's readonly State. */
  readonly state = inject(OrigamiMenuState);
}
