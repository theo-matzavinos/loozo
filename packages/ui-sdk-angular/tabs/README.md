# Tabs

`@loozo/ui-sdk-angular/tabs`: tabs and the panels they show, core's `tabs`, from directives on elements you write: the tabs, their list, each tab and its icon, an indicator, and the panels. A panel is structural: core decides whether its element is in the page.

```ts
import {
  UiTabs,
  UiTabsIndicator,
  UiTabsList,
  UiTabsPanel,
  UiTabsTab,
  UiTabsTabIcon,
} from "@loozo/ui-sdk-angular/tabs";
```

```html
<div uiTabs [(value)]="section">
  <div uiTabsList aria-label="Account">
    <button uiTabsTab value="profile"><svg uiTabsTabIcon>…</svg>Profile</button>
    <button uiTabsTab value="billing" [disabled]="!paid">Billing</button>
    <span uiTabsIndicator></span>
  </div>
  <div *uiTabsPanel="'profile'">…</div>
  <ng-template uiTabsPanel="billing" hiddenUntilFound>
    <div class="panel">…</div>
  </ng-template>
</div>
```

## `uiTabs`

`exportAs: "uiTabs"`. Put it on an element around the list and the panels.

| Input              | Type                                      | Core option                                                                   |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `value`            | `T \| null \| undefined`                  | The selected tab's value; `null` selects none. Set it to control the tabs.    |
| `defaultValue`     | `T \| null \| undefined`                  | The tab selected at first, when uncontrolled.                                 |
| `orientation`      | `"horizontal" \| "vertical" \| undefined` | Which arrow keys move between tabs.                                           |
| `activation`       | `"automatic" \| "manual" \| undefined`    | Whether focusing a tab with the arrow keys selects it, or Enter and Space do. |
| `loop`             | `boolean \| undefined`                    | Whether arrow keys wrap; core's default `true`.                               |
| `hiddenUntilFound` | `boolean \| undefined`                    | Keeps unselected panels in the page as `hidden="until-found"`.                |
| `controller`       | `TabsController \| undefined`             | From core's `createTabsController()`, to select tabs from anywhere.           |
| `debug`            | `boolean \| undefined`                    | Logs state changes, in development builds.                                    |

| Output               | Payload                                                      |
| -------------------- | ------------------------------------------------------------ |
| `valueChangeRequest` | `{ value: T \| null, details }`; `details.cancel()` refuses. |
| `valueChange`        | `T \| null`, unless a request listener canceled it.          |

`state: Signal<TabsState<T>>` is `{ value, orientation, direction }`; `direction` is which way the last selection moved. `valueChange` is the proposal, emitted before core commits it: with `[(value)]` it lands when the binding writes it back; uncontrolled, core stores it after your listeners return. Read the committed state from `state()`. Tabs have no completion output.

## Parts

| Directive         | `exportAs`        | Inputs                                                      | `state()`                    |
| ----------------- | ----------------- | ----------------------------------------------------------- | ---------------------------- |
| `uiTabsList`      | `uiTabsList`      | none                                                        | `{ orientation }`            |
| `uiTabsTab`       | `uiTabsTab`       | `value` (required), `disabled`                              | `{ selected, disabled }`     |
| `uiTabsTabIcon`   | `uiTabsTabIcon`   | `mirror`                                                    | `{ mirror }`                 |
| `uiTabsIndicator` | `uiTabsIndicator` | none                                                        | `{ orientation, direction }` |
| `uiTabsPanel`     | `uiTabsPanel`     | `uiTabsPanel` (required), `keepMounted`, `hiddenUntilFound` | `{ selected }`               |

- **A tab and its panel share a value**, spelled two ways: the tab's `value="billing"`, and the panel's own input, `*uiTabsPanel="'billing'"` or `<ng-template uiTabsPanel="billing">`, because `*` binds only the directive's own input without a prefix. A tab without `value` doesn't compile.
- **The list** takes the arrow keys, Home and End, with one tab stop; name it with `aria-label` or `aria-labelledby`. Tabs go on `<button>`s. A disabled tab stays reachable with the arrow keys and can't be selected; bind `[disabled]` rather than a static `disabled` attribute, which would disable the button natively.
- **The icon** goes inside its tab. Core marks the tab `data-has-icon` and the list `data-has-icons` once it binds; `mirror` flips arrows in right-to-left text.
- **The indicator** goes inside the list. Core sets `--active-tab-left`, `--active-tab-top`, `--active-tab-width` and `--active-tab-height` on it once it binds.
- **A panel is structural.** Write `*uiTabsPanel` on the panel's element. It's in the page while core has it there: selected, leaving (until its exit animation ends), kept or findable. An unselected panel in the default mode isn't in the page, and its content, with any component state inside it, is destroyed; a kept or findable one keeps its content while hidden.
- **Per-panel options need the `<ng-template>` form**, since `*uiTabsPanel="'a'; keepMounted: true"` would bind an input named `uiTabsPanelKeepMounted`: `<ng-template uiTabsPanel="a" keepMounted><div>…</div></ng-template>`. A panel's `hiddenUntilFound` overrides the tabs'.
- **One unconditional root element.** A panel's template renders exactly one element, the panel: put everything else, every `@if` and `@for` included, inside it. Two elements, text or no element throws `UiSdkError` when the panel first renders, in every build. The check runs when the panel's view is created, so it catches static siblings only: a top-level `@if` or `@for` beside the element renders outside the panel without an error.
- **Panels can't be composed through `hostDirectives`**: they need their template.

## Rules

- **Style by core's attributes**: `[aria-selected="true"]` on the selected tab, `[data-selected]` on it and its panel, `[data-disabled]`, `[data-orientation]`, `[data-has-icon]`, and `[data-starting-style]`/`[data-ending-style]` for panel transitions.
- **Don't set `display` on a kept or findable panel's class**; scope it with `:not([hidden])`. Core's rule that hides `[hidden]` panels arrives at bind.
- **`[value]="null"` is a value**: no tab is selected, and no panel in the default mode renders. Kept and findable panels stay in the page, hidden.
- **Manual activation, right-to-left arrows and links as tabs** are core's; see core's docs.

## Server rendering

- **Give a server-rendered Tabs a concrete `value` or `defaultValue`.** Without one:
  - **The server selects the first enabled tab in the order Angular creates them**, which is DOM order only when every tab sits at one level: all static in the list, or all in one `@for`. A mixed list can make the server select a later tab: with an enabled tab inside `@if` before enabled static tabs, the server selects the first static one; at bind core selects the first enabled tab in DOM order instead, with no output, and the panel and the tab stop move with it.
  - **The selected tab's default-mode panel is in the server's HTML only when the tabs render before the panels**: a static list then static panels, or `@for` tabs then `@for` panels. When the panels come first, or the tabs are in a `@for` and the panels aren't, the server selects the tab without its panel; at bind its panel mounts with core's enter animation. A `keepMounted` or `hiddenUntilFound` panel is in the server's HTML either way.
  - **`state().value` is `null` on the server** in every layout, and so is a controller's `getValue()`, though a tab renders selected and its panel may render too. The browser's first bind sets it to the first enabled tab's value, with no output; with every tab disabled it stays `null`. Don't render server content from it.
- **The tab stop** is the selected tab, on the server and after bind, with these exceptions:
  - a controlled `value` naming a disabled tab: the server makes that tab the stop, and core moves the stop to the first enabled tab at bind while the disabled one stays selected;
  - `[value]="null"`: the first enabled tab is the stop though nothing is selected;
  - every tab disabled, with no `value` or `defaultValue`: no stop on the server; the first tab gets it at bind.
- The selected panel renders with `role="tabpanel"`, `aria-labelledby` and no `hidden`; the other panels render only Angular's anchor comment, or the hidden element when kept or findable.
- **A tab's static `id` reaches its panel's server `aria-labelledby` only when the tab writes first**: both static with the tab earlier, or the tab in an earlier `@if` or `@for` than the panels' block, in the same parent view. A tab list in its own component writes after every block of the parent, so it can't name panels declared there. A tab in a `@for` with its panel static after the list writes after the panel, so the server names the generated tab id, which matches no element; core repairs it when the parts bind. Without an authored `id` the generated ids always match. See [authored ids](../README.md#server-rendering-and-hydration).
- **At bind**, core adds what the server can't know: tabs' `aria-controls` for the panels in the page, a panel's `tabindex="0"` when it has no focusable content, the indicator's variables, the icons' `data-has-icon` and the list's `data-has-icons`.
- **Keep the tabs and their panels in one `@defer (hydrate …)` block.** A block that hydrates only some of them can change core's first-tab detection.
- **A panel that is selected in the browser** has its attributes and `data-starting-style` by its first frame. Code that runs synchronously between its insertion and the first write, like a directive constructor inside the panel, sees the element without core's attributes.
- **Find in page before hydration** reveals a findable panel's text without selecting its tab. The hidden state comes back when the panel hydrates or binds. After bind, a find in an enabled tab's panel selects that tab with reason `"find-in-page"`, and canceling the request restores `until-found`. A disabled tab can't be selected: the browser reveals its panel's text, then core hides it again, with no request.
- **A malformed panel template in a panel unselected on the server** throws only when the panel first renders.
