import { Directive, type Signal, computed, inject, input, output } from "@angular/core";
import {
  UiSdkError,
  type UiSdkEvent,
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { AccordionItemProps, AccordionItemState } from "@ui-sdk/core/accordion";
import { UiAccordion } from "./accordion";

/** Core's `item` slot handles no events. */
const events = [] as const;

/** UiAccordionItem takes every core prop as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * One section of the accordion, around its header and panel. Its `value` names it in the
 * accordion's `value`; without one it gets a value made for it, rendered as `data-ui-sdk-id` so
 * hydration keeps it. Its outputs report requests and settling only: read whether it's open from
 * `state()` or the accordion's `value`.
 *
 * @example
 * ```html
 * <div uiAccordionItem value="shipping" (openChangeRequest)="guard($event)">
 *   <h3 uiAccordionHeader><button uiAccordionTrigger>Shipping</button></h3>
 *   <div *uiAccordionPanel>…</div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiAccordionItem]",
  exportAs: "uiAccordionItem",
  host: { "[attr.data-ui-sdk-id]": "renderedId()" },
})
export class UiAccordionItem {
  /**
   * Names the item in the accordion's `value`. Leave it unset for a value made for it, only when
   * the accordion's model is `string[]`: a made value isn't one of a narrower union.
   */
  readonly value = input<string | undefined>(undefined);
  /** Stops its trigger's presses. `[value]`, the controller and find in page still open it. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /**
   * Something wants to open or close this item. Call `details.cancel()` to refuse the whole
   * change. It's a request, not a commit: another item or the accordion's `valueChangeRequest` can
   * still refuse it.
   */
  readonly openChangeRequest =
    output<UiSdkEvent<NonNullable<AccordionItemProps["onOpenChange"]>>>();
  /** Its panel finished opening or closing, after its animations. None on the first render. */
  readonly openChangeComplete = output<boolean>();

  /** The accordion this item belongs to; its parts check it's their nearest one. Not public API. */
  readonly ɵaccordion = inject(UiAccordion);
  readonly #made = ɵinjectInstanceId();
  /** Core's `value` for this item and its parts: `value`, or the made one. Not public API. */
  readonly ɵvalue = computed(() => this.value() ?? this.#made);
  /** The made value, rendered only while it's in use. */
  protected readonly renderedId = computed(() => {
    if (this.value() !== undefined) {
      return null;
    }

    return this.#made;
  });

  // Kept as fields, so the props stay equal while `value` and `disabled` don't change.
  readonly #onOpenChange: NonNullable<AccordionItemProps["onOpenChange"]> = (open, details) => {
    this.openChangeRequest.emit({ value: open, details });
  };
  readonly #onOpenChangeComplete: NonNullable<AccordionItemProps["onOpenChangeComplete"]> = (
    open,
  ) => {
    this.openChangeComplete.emit(open);
  };

  protected readonly slot = ɵinjectSlot<AccordionItemState>(
    this.ɵaccordion.ɵroot,
    "item",
    () => ({
      value: this.ɵvalue(),
      disabled: this.disabled(),
      onOpenChange: this.#onOpenChange,
      onOpenChangeComplete: this.#onOpenChangeComplete,
    }),
    { events },
  );

  /** Whether it's open and disabled, and its position among the items. */
  readonly state: Signal<AccordionItemState> = this.slot.state;
}

/**
 * The enclosing item, checked against the nearest Accordion: a part directly inside a nested
 * Accordion without its own item would otherwise act on the outer item. `directive` names the part
 * in the error. Not public API.
 */
export function ɵinjectAccordionItem(directive: string): UiAccordionItem {
  const item = inject(UiAccordionItem);

  if (item.ɵaccordion !== inject(UiAccordion)) {
    throw new UiSdkError(
      `${directive} goes inside a uiAccordionItem of the same uiAccordion. Wrap it in <div uiAccordionItem> inside that accordion.`,
    );
  }

  return item;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiAccordionItem>,
    Exclude<keyof AccordionItemProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
