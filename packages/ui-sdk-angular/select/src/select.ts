import {
  DOCUMENT,
  DestroyRef,
  Directive,
  type InputSignal,
  type OnInit,
  inject,
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
import { type SelectOptions, select } from "@ui-sdk/core/select";

/** Core's `root` slot handles no events. */
const events = [] as const;

/** How UiSelect passes core's options that aren't inputs. Excluded: `multiple` (single value only). */
const classes = {
  internal: [],
  fixed: [],
  excluded: ["multiple"],
} as const;

/** Core's options for one value, without the `multiple: true` branch this release excludes. */
type SingleOptions<T> = Extract<SelectOptions<T>, { multiple?: false }>;

/**
 * A single-value select, on an element around its trigger and content. Inputs are core's
 * `select` options. `value`, `open` and `query` control it when set; `null` selects nothing and
 * stays controlled. Each `<key>ChangeRequest` output comes first and can cancel; `<key>Change`
 * follows unless canceled, so `[(value)]` binds both. To submit it with a form, give it a `name` and
 * write `<input uiSelectFormInput />` inside it.
 *
 * @example
 * ```html
 * <div uiSelect [(value)]="fruit">
 *   <button uiSelectTrigger aria-label="Fruit"><span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span></button>
 *   <div uiSelectContent>
 *     <div [uiSelectItem]="'apple'" label="Apple">Apple</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiSelect]",
  exportAs: "uiSelect",
  host: { "[attr.data-ui-sdk-id]": "instanceId", "(document:focusout)": "focusOut($event)" },
})
export class UiSelect<T = string> implements OnInit {
  /** The selected value; `null` selects nothing. Set it to control the select. */
  readonly value = input<T | null | undefined>(undefined);
  /** The value selected at first, when uncontrolled. */
  readonly defaultValue = input<T | null | undefined>(undefined);
  /** Whether the popup is open. Set it to control it. */
  readonly open = input(undefined, { transform: optionalBoolean });
  /** Whether the popup is open at first, when uncontrolled. */
  readonly defaultOpen = input(undefined, { transform: optionalBoolean });
  /** The search query. Set it to control it. No search input slot ships yet. */
  readonly query = input<string | undefined>(undefined);
  /** The search query at first, when uncontrolled. */
  readonly defaultQuery = input<string | undefined>(undefined);
  /** The items as data, which also gives the value's label before the items render. */
  readonly items: InputSignal<SelectOptions<T>["items"]> =
    input<SelectOptions<T>["items"]>(undefined);
  /** The items shown when nothing matches. No empty slot ships yet. */
  readonly emptyItems: InputSignal<SelectOptions<T>["emptyItems"]> =
    input<SelectOptions<T>["emptyItems"]>(undefined);
  /** How the query matches items. */
  readonly filter: InputSignal<SelectOptions<T>["filter"]> =
    input<SelectOptions<T>["filter"]>(undefined);
  /** The loading status of asynchronous items. */
  readonly status: InputSignal<SelectOptions<T>["status"]> =
    input<SelectOptions<T>["status"]>(undefined);
  /** What screen readers hear when the visible items change. */
  readonly announcement: InputSignal<SelectOptions<T>["announcement"]> =
    input<SelectOptions<T>["announcement"]>(undefined);
  /** Shown while nothing is selected. */
  readonly placeholder = input<string | undefined>(undefined);
  /** Maps an item value to its string key, for object values. */
  readonly itemToValue = input<((item: T) => string) | undefined>(undefined);
  /** Maps an item value to its label, for server-correct labels. */
  readonly itemToLabel = input<((item: T) => string) | undefined>(undefined);
  /** Compares an item value with the selected value. */
  readonly isItemEqualToValue = input<((item: T, value: T) => boolean) | undefined>(undefined);
  /** Whether arrow keys wrap around. */
  readonly loop = input(undefined, { transform: optionalBoolean });
  /**
   * Keeps focus on the trigger while the list is open, as on a native select: arrow keys, Home, End
   * and typing move the highlight, which the trigger points at with `aria-activedescendant`.
   */
  readonly virtualFocus = input(undefined, { transform: optionalBoolean });
  /** Whether the open popup blocks the rest of the page. */
  readonly modal: InputSignal<SelectOptions<T>["modal"]> =
    input<SelectOptions<T>["modal"]>(undefined);
  /** A popover, or a sheet on small screens. */
  readonly presentation: InputSignal<SelectOptions<T>["presentation"]> =
    input<SelectOptions<T>["presentation"]>(undefined);
  /** Stops opening and selecting. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Opens but doesn't change the value. Written `readonly`, like a native input's. */
  readonly readOnly = input(undefined, { alias: "readonly", transform: optionalBoolean });
  /** Opens, closes and selects from anywhere; create one with `createSelectController()`. */
  readonly controller: InputSignal<SelectOptions<T>["controller"]> =
    input<SelectOptions<T>["controller"]>(undefined);
  /** Renders the popup into this element instead of in place. */
  readonly container: InputSignal<SelectOptions<T>["container"]> =
    input<SelectOptions<T>["container"]>(undefined);
  /** Whether Escape and outside presses close it. */
  readonly dismissible = input(undefined, { transform: optionalBoolean });
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** The name the value submits under, through its form input. Without one, it submits nothing. */
  readonly name = input<string | undefined>(undefined);
  /** The id of the form it belongs to, when it isn't inside that form. */
  readonly form = input<string | undefined>(undefined);
  /** Blocks form submission until a value is selected. */
  readonly required = input(undefined, { transform: optionalBoolean });
  /** The form input's `autocomplete`, for browser autofill. */
  readonly autoComplete = input<string | undefined>(undefined);

  /** A selection wants to change `value`. Call `details.cancel()` to refuse it. */
  readonly valueChangeRequest =
    output<UiSdkEvent<NonNullable<SingleOptions<T>["onValueChange"]>>>();
  /** `value` changed, after no `valueChangeRequest` listener canceled it. */
  readonly valueChange = output<T | null>();
  /** Something wants to open or close the popup. Call `details.cancel()` to refuse it. */
  readonly openChangeRequest = output<UiSdkEvent<NonNullable<SelectOptions<T>["onOpenChange"]>>>();
  /** `open` changed, after no `openChangeRequest` listener canceled it. */
  readonly openChange = output<boolean>();
  /** The popup finished opening or closing, after its animations. */
  readonly openChangeComplete = output<boolean>();
  /** Something wants to change the query. Call `details.cancel()` to refuse it. */
  readonly queryChangeRequest =
    output<UiSdkEvent<NonNullable<SelectOptions<T>["onQueryChange"]>>>();
  /** `query` changed, after no `queryChangeRequest` listener canceled it. */
  readonly queryChange = output<string>();
  /** The list scrolled near its end; load more items. */
  readonly loadMore = output<void>();
  /** The highlighted item changed. */
  readonly highlight = output<UiSdkEvent<NonNullable<SelectOptions<T>["onHighlight"]>>>();
  /** `dismissible` refused a dismissal made on purpose. */
  readonly dismissAttempt =
    output<Parameters<NonNullable<SelectOptions<T>["onDismissAttempt"]>>[0]>();
  /**
   * Focus left the trigger and its popup, so the user is done with it; opening the popup, moving
   * through items and closing it back to the trigger don't count. Signal Forms' `[formField]` marks
   * the field touched on it. Focus leaving before the select has rendered doesn't emit.
   */
  readonly touch = output<void>();

  /** The core instance; the slot directives read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    select,
    () => ({
      value: this.value() as string | null | undefined,
      defaultValue: this.defaultValue() as string | null | undefined,
      open: this.open(),
      defaultOpen: this.defaultOpen(),
      query: this.query(),
      defaultQuery: this.defaultQuery(),
      items: this.items() as SelectOptions["items"],
      emptyItems: this.emptyItems() as SelectOptions["emptyItems"],
      filter: this.filter() as SelectOptions["filter"],
      status: this.status(),
      announcement: this.announcement(),
      placeholder: this.placeholder(),
      itemToValue: this.itemToValue() as SelectOptions["itemToValue"],
      itemToLabel: this.itemToLabel() as SelectOptions["itemToLabel"],
      isItemEqualToValue: this.isItemEqualToValue() as SelectOptions["isItemEqualToValue"],
      loop: this.loop(),
      virtualFocus: this.virtualFocus(),
      modal: this.modal(),
      presentation: this.presentation(),
      disabled: this.disabled(),
      readOnly: this.readOnly(),
      controller: this.controller(),
      container: this.container(),
      dismissible: this.dismissible(),
      debug: this.debug(),
      name: this.name(),
      form: this.form(),
      required: this.required(),
      autoComplete: this.autoComplete(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T | null, details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T | null);
      },
      onOpenChange: (open, details) => {
        this.openChangeRequest.emit({ value: open, details });

        if (details.canceled) {
          return;
        }

        this.openChange.emit(open);
      },
      onOpenChangeComplete: (open) => this.openChangeComplete.emit(open),
      onQueryChange: (query, details) => {
        this.queryChangeRequest.emit({ value: query, details });

        if (details.canceled) {
          return;
        }

        this.queryChange.emit(query);
      },
      onLoadMore: () => this.loadMore.emit(),
      onHighlight: (value, details) => {
        // Core reports the highlighted item leaving the list a microtask after it unbinds, which
        // for a Select destroyed while open comes after its outputs are gone.
        if (this.#destroyRef.destroyed) {
          return;
        }

        this.highlight.emit({ value: value as T | null, details });
      },
      onDismissAttempt: (details) => this.dismissAttempt.emit(details),
    }),
    "uiSelect",
    { slot: "form-input", markup: "<input uiSelectFormInput /> inside it" },
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot(this.ɵroot, "root", () => ({}), { events });

  readonly #destroyRef = inject(DestroyRef);
  readonly #document = inject(DOCUMENT);

  /**
   * Focuses the trigger. Signal Forms' `focusBoundControl()` calls it. Core's focus takes no
   * options, so `options` is ignored. It takes effect once the trigger has rendered; earlier it
   * does nothing.
   */
  focus(_options?: FocusOptions): void {
    if (!this.ɵroot.isReady()) {
      return;
    }

    this.ɵroot.instance().api.focus();
  }

  protected focusOut(event: FocusEvent): void {
    if (!this.ɵroot.isReady()) {
      return;
    }

    const { internal } = this.ɵroot.instance().api;

    if (!within(event.target, internal)) {
      return;
    }

    // Closing the popup returns focus to the trigger right after this focusout, as after an item
    // press or Escape; decide once that has landed.
    queueMicrotask(() => {
      if (this.#destroyRef.destroyed || within(this.#document.activeElement, internal)) {
        return;
      }

      this.touch.emit();
    });
  }

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

/** The trigger and popup lookups `within` reads from core's adapter-facing API. */
type Boundary = {
  controlElement(): HTMLElement | undefined;
  readonly popup: { element(): HTMLElement | undefined };
};

/** Whether `target` is inside the select's trigger or its popup, wherever the popup renders. */
function within(target: EventTarget | null, internal: Boundary): boolean {
  if (!(target instanceof Node)) {
    return false;
  }

  const trigger = internal.controlElement();
  const popup = internal.popup.element();

  return trigger?.contains(target) === true || popup?.contains(target) === true;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelect>,
    Exclude<keyof SelectOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
