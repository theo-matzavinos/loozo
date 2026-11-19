import {
  Directive,
  type InputSignal,
  type OnInit,
  type Signal,
  inject,
  input,
} from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  type ɵUiSdkToolbarScope,
  optionalBoolean,
  ɵUI_SDK_TOOLBAR,
  ɵinjectRoot,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { type ToolbarOptions, type ToolbarState, toolbar } from "@ui-sdk/core/toolbar";

/** The event types core's `root` slot handles, declared below as static host listeners. */
const events = ["keydown"] as const;

/** UiToolbar takes every core option as an input. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * A row of controls with one tab stop and arrow keys between them, on an element around them.
 * Inputs are core's `toolbar` options. Its items are `uiToolbarButton`, `uiToolbarLink` and
 * `uiToolbarInput`; toggles and toggle groups inside join it too.
 *
 * @example
 * ```html
 * <div uiToolbar aria-label="Formatting">
 *   <button uiToggle aria-label="Bold">B</button>
 *   <div uiToolbarSeparator></div>
 *   <button uiToolbarButton>Share</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiToolbar]",
  exportAs: "uiToolbar",
  host: {
    "[attr.data-ui-sdk-id]": "instanceId",
    "(keydown)": 'slot.dispatch("keydown", $event)',
  },
  providers: [{ provide: ɵUI_SDK_TOOLBAR, useFactory: () => scopeOf(inject(UiToolbar)) }],
})
export class UiToolbar implements OnInit {
  /** Which arrow keys move between items. */
  readonly orientation: InputSignal<ToolbarOptions["orientation"]> =
    input<ToolbarOptions["orientation"]>(undefined);
  /** Whether arrow keys wrap from the last item to the first; core's default is `true`. */
  readonly loop = input(undefined, { transform: optionalBoolean });
  /** Stops every item; they stay focusable with `aria-disabled`. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Focuses the toolbar from anywhere; create one with `createToolbarController()`. */
  readonly controller: InputSignal<ToolbarOptions["controller"]> =
    input<ToolbarOptions["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });

  /** The core instance; the items inside read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    toolbar,
    () => ({
      orientation: this.orientation(),
      loop: this.loop(),
      disabled: this.disabled(),
      controller: this.controller(),
      debug: this.debug(),
    }),
    "uiToolbar",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<ToolbarState>(this.ɵroot, "root", () => ({}), { events });

  /** Its orientation, and whether it's disabled. */
  readonly state: Signal<ToolbarState> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

function scopeOf(toolbar: UiToolbar): ɵUiSdkToolbarScope {
  return {
    groupDisabled: () => false,
    scopeIn: (groupDisabled) => toolbar.ɵroot.instance().api.internal.scopeIn(groupDisabled),
  };
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToolbar>,
    Exclude<keyof ToolbarOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
