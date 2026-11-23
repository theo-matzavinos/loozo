import {
  Directive,
  type InputSignal,
  type OnInit,
  type Signal,
  input,
  output,
} from "@angular/core";
import {
  type UiSdkEvent,
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectRoot,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import {
  type CollapsibleOptions,
  type CollapsibleState,
  collapsible,
} from "@ui-sdk/core/collapsible";

/** Core's `root` slot handles no events. */
const events = [] as const;

/** UiCollapsible takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * A panel its trigger shows and hides, on an element around both. Inputs are core's `collapsible`
 * options; `open` controls it and `openChange` reports a change, so `[(open)]` binds both. The
 * panel is structural: core leaves a closed panel out of the page unless it's kept.
 *
 * @example
 * ```html
 * <div uiCollapsible [(open)]="details">
 *   <button uiCollapsibleTrigger>Details</button>
 *   <div *uiCollapsiblePanel>…</div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiCollapsible]",
  exportAs: "uiCollapsible",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiCollapsible implements OnInit {
  /** Whether it's open. Set it to control the collapsible; leave it unset for core to own it. */
  readonly open = input(undefined, { transform: optionalBoolean });
  /** Whether it starts open, when uncontrolled. */
  readonly defaultOpen = input(undefined, { transform: optionalBoolean });
  /** Stops trigger presses. `[open]`, the controller and find in page still open it. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Opens and closes it from anywhere; create one with `createCollapsibleController()`. */
  readonly controller: InputSignal<CollapsibleOptions["controller"]> =
    input<CollapsibleOptions["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** Something wants to open or close it. Call `details.cancel()` to refuse it. */
  readonly openChangeRequest =
    output<UiSdkEvent<NonNullable<CollapsibleOptions["onOpenChange"]>>>();
  /**
   * `open` is changing, after no `openChangeRequest` listener canceled it. Core commits it after
   * your listeners return; read the committed state from `state()`.
   */
  readonly openChange = output<boolean>();
  /** The panel finished opening or closing, after its animations. None on the first render. */
  readonly openChangeComplete = output<boolean>();

  /** The core instance; the trigger and panel read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    collapsible,
    () => ({
      open: this.open(),
      defaultOpen: this.defaultOpen(),
      disabled: this.disabled(),
      controller: this.controller(),
      debug: this.debug(),
      onOpenChange: (open, details) => {
        this.openChangeRequest.emit({ value: open, details });

        if (details.canceled) {
          return;
        }

        this.openChange.emit(open);
      },
      onOpenChangeComplete: (open) => {
        this.openChangeComplete.emit(open);
      },
    }),
    "uiCollapsible",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<CollapsibleState>(this.ɵroot, "root", () => ({}), {
    events,
  });

  /** Whether it's open, and whether it's disabled. */
  readonly state: Signal<CollapsibleState> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiCollapsible>,
    Exclude<keyof CollapsibleOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
