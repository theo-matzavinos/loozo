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
import { type AccordionOptions, type AccordionState, accordion } from "@ui-sdk/core/accordion";

/** Core's `root` slot handles no events. */
const events = [] as const;

/** UiAccordion takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * Sections that open and close, on an element around their items. Inputs are core's `accordion`
 * options; `value` lists the open items, controls it when set, and `valueChange` reports a change,
 * so `[(value)]` binds both. Each `uiAccordionItem` inside holds a header, a trigger and a panel.
 *
 * @example
 * ```html
 * <div uiAccordion [(value)]="open" multiple>
 *   <div uiAccordionItem value="shipping">
 *     <h3 uiAccordionHeader><button uiAccordionTrigger>Shipping</button></h3>
 *     <div *uiAccordionPanel>…</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiAccordion]",
  exportAs: "uiAccordion",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiAccordion<T extends string = string> implements OnInit {
  /**
   * The open items' values, also with `multiple` off. Set it to control the accordion. `T` isn't
   * checked against the items: an item without `value` puts its made string here, so with a
   * narrower `T` than `string` give every item a `value` from `T`.
   */
  readonly value = input<T[] | undefined>(undefined);
  /** The items open at first, when uncontrolled. */
  readonly defaultValue = input<T[] | undefined>(undefined);
  /** Lets several items be open at once. */
  readonly multiple = input(undefined, { transform: optionalBoolean });
  /** Whether the open item can be closed, when only one may be open; core's default is `true`. */
  readonly collapsible = input(undefined, { transform: optionalBoolean });
  /** Stops trigger presses on every item. `[value]`, the controller and find in page still open them. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps closed panels in the page, hidden, so their content keeps its state. */
  readonly keepMounted = input(undefined, { transform: optionalBoolean });
  /** Keeps closed panels in the page as `hidden="until-found"`, so find in page opens them. */
  readonly hiddenUntilFound = input(undefined, { transform: optionalBoolean });
  /** Opens and closes items from anywhere; create one with `createAccordionController()`. */
  readonly controller: InputSignal<AccordionOptions<T>["controller"]> =
    input<AccordionOptions<T>["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /**
   * A press, the controller or find in page wants to change `value`, after every item's
   * `openChangeRequest` let it. Call `details.cancel()` to refuse it.
   */
  readonly valueChangeRequest =
    output<UiSdkEvent<NonNullable<AccordionOptions<T>["onValueChange"]>>>();
  /**
   * `value` is changing, after no `valueChangeRequest` listener canceled it. Core commits it after
   * your listeners return; read the committed state from `state()`.
   */
  readonly valueChange = output<T[]>();

  /** The core instance; the items and their parts read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    accordion,
    () => ({
      value: this.value(),
      defaultValue: this.defaultValue(),
      multiple: this.multiple(),
      collapsible: this.collapsible(),
      disabled: this.disabled(),
      keepMounted: this.keepMounted(),
      hiddenUntilFound: this.hiddenUntilFound(),
      controller: this.controller() as AccordionOptions["controller"],
      debug: this.debug(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T[], details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T[]);
      },
    }),
    "uiAccordion",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<AccordionState<T>>(this.ɵroot, "root", () => ({}), {
    events,
  });

  /** The open items' values, whether it's disabled, and whether several can be open. */
  readonly state: Signal<AccordionState<T>> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiAccordion>,
    Exclude<keyof AccordionOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
