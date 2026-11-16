import {
  Directive,
  type InputSignal,
  HostAttributeToken,
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

/**
 * How UiSelect passes core's options that aren't inputs. Excluded from this release: `multiple`
 * (single value only) and native form participation (`name`, `form`, `required`,
 * `autoComplete`).
 */
const classes = {
  internal: [],
  fixed: [],
  excluded: ["multiple", "name", "form", "required", "autoComplete"],
} as const;

/** Core's options for one value, without the `multiple: true` branch this release excludes. */
type SingleOptions<T> = Extract<SelectOptions<T>, { multiple?: false }>;

/**
 * A single-value select, on an element around its trigger and content. Inputs are core's
 * `select` options. `value`, `open` and `query` control it when set; `null` selects nothing and
 * stays controlled. Each `<key>ChangeRequest` output comes first and can cancel; `<key>Change`
 * follows unless canceled, so `[(value)]` binds both.
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
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
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
  /** Whether the open popup blocks the rest of the page. */
  readonly modal: InputSignal<SelectOptions<T>["modal"]> =
    input<SelectOptions<T>["modal"]>(undefined);
  /** A popover, or a sheet on small screens. */
  readonly presentation: InputSignal<SelectOptions<T>["presentation"]> =
    input<SelectOptions<T>["presentation"]>(undefined);
  /** Stops opening and selecting. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Opens but doesn't change the value. */
  readonly readOnly = input(undefined, { transform: optionalBoolean });
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
      modal: this.modal(),
      presentation: this.presentation(),
      disabled: this.disabled(),
      readOnly: this.readOnly(),
      controller: this.controller(),
      container: this.container(),
      dismissible: this.dismissible(),
      debug: this.debug(),
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
      onHighlight: (value, details) => this.highlight.emit({ value: value as T | null, details }),
      onDismissAttempt: (details) => this.dismissAttempt.emit(details),
    }),
    "uiSelect",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot(this.ɵroot, "root", () => ({}), { events });

  constructor() {
    const name = inject(new HostAttributeToken("name"), { optional: true });

    if ((typeof ngDevMode === "undefined" || ngDevMode) && name !== null) {
      console.warn(
        `uiSelect: name="${name}" has no effect. This release of @loozo/ui-sdk-angular doesn't take part in native forms; submit the bound value yourself.`,
      );
    }
  }

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelect>,
    Exclude<keyof SelectOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
