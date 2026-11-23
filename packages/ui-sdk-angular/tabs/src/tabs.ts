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
import { type TabsOptions, type TabsState, tabs } from "@ui-sdk/core/tabs";

/** Core's `root` slot handles no events. */
const events = [] as const;

/** UiTabs takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * Tabs and the panels they show, on an element around both. Inputs are core's `tabs` options;
 * `value` names the selected tab, controls it when set, and `valueChange` reports a change, so
 * `[(value)]` binds both. `null` selects no tab and stays controlled. Give a server-rendered Tabs a
 * `value` or `defaultValue`. Without one, the server selects the first enabled tab in Angular's
 * creation order, which is DOM order only when every tab sits at one level (all static, or all in
 * one `@for`), and bind can move it to the first in DOM order; its default-mode panel is in the
 * server's HTML only when the tabs render before the panels; and `state().value` is `null` until
 * the browser binds.
 *
 * @example
 * ```html
 * <div uiTabs [(value)]="section">
 *   <div uiTabsList aria-label="Account">
 *     <button uiTabsTab value="profile">Profile</button>
 *     <button uiTabsTab value="billing">Billing</button>
 *   </div>
 *   <div *uiTabsPanel="'profile'">…</div>
 *   <div *uiTabsPanel="'billing'">…</div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiTabs]",
  exportAs: "uiTabs",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiTabs<T extends string = string> implements OnInit {
  /**
   * The selected tab's value; `null` selects none. Set it to control the tabs. `T` isn't checked
   * against the tabs, which take any string: with a narrower `T` than `string`, give every tab a
   * `value` from `T`.
   */
  readonly value = input<T | null | undefined>(undefined);
  /** The tab selected at first, when uncontrolled. */
  readonly defaultValue = input<T | null | undefined>(undefined);
  /** Which arrow keys move between tabs. */
  readonly orientation: InputSignal<TabsOptions<T>["orientation"]> =
    input<TabsOptions<T>["orientation"]>(undefined);
  /** Whether focusing a tab with the arrow keys selects it (`automatic`), or Enter and Space do. */
  readonly activation: InputSignal<TabsOptions<T>["activation"]> =
    input<TabsOptions<T>["activation"]>(undefined);
  /** Whether arrow keys wrap from the last tab to the first; core's default is `true`. */
  readonly loop = input(undefined, { transform: optionalBoolean });
  /**
   * Keeps unselected panels in the page as `hidden="until-found"`, so find in page selects an
   * enabled tab. A disabled tab isn't selected: the browser reveals its panel's text, then core
   * hides it again, with no request.
   */
  readonly hiddenUntilFound = input(undefined, { transform: optionalBoolean });
  /** Selects tabs from anywhere; create one with `createTabsController()`. */
  readonly controller: InputSignal<TabsOptions<T>["controller"]> =
    input<TabsOptions<T>["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press, arrow keys, find in page or the controller wants to change `value`. Call `details.cancel()` to refuse it. */
  readonly valueChangeRequest = output<UiSdkEvent<NonNullable<TabsOptions<T>["onValueChange"]>>>();
  /**
   * `value` is changing, after no `valueChangeRequest` listener canceled it. Core commits it after
   * your listeners return; read the committed state from `state()`.
   */
  readonly valueChange = output<T | null>();

  /** The core instance; the list, tabs and panels read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    tabs,
    () => ({
      value: this.value(),
      defaultValue: this.defaultValue(),
      orientation: this.orientation(),
      activation: this.activation(),
      loop: this.loop(),
      hiddenUntilFound: this.hiddenUntilFound(),
      controller: this.controller() as TabsOptions["controller"],
      debug: this.debug(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T | null, details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T | null);
      },
    }),
    "uiTabs",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<TabsState<T>>(this.ɵroot, "root", () => ({}), {
    events,
  });

  /**
   * The selected value, the orientation, and which way the last selection moved. Without a
   * `value` or `defaultValue`, `value` is `null` on the server though a tab renders selected; the
   * browser's first bind sets it, with no output.
   */
  readonly state: Signal<TabsState<T>> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiTabs>,
    Exclude<keyof TabsOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
