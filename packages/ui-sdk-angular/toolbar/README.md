# Toolbar

`@loozo/ui-sdk-angular/toolbar`: a row of controls with one tab stop and arrow keys between them, core's `toolbar`, from directives on elements you write: the toolbar, its buttons, links and text fields, groups of them, and separators. A [`uiToggle` or `uiToggleGroup`](../toggle/README.md) inside joins it too.

```ts
import {
  UiToolbar,
  UiToolbarButton,
  UiToolbarGroup,
  UiToolbarInput,
  UiToolbarLink,
  UiToolbarSeparator,
} from "@loozo/ui-sdk-angular/toolbar";
```

```html
<div uiToolbar aria-label="Formatting">
  <button uiToggle aria-label="Bold">B</button>
  <div uiToggleGroup [(value)]="align" aria-label="Alignment">
    <button uiToggle value="left">Left</button>
    <button uiToggle value="right">Right</button>
  </div>
  <div uiToolbarSeparator></div>
  <div uiToolbarGroup [disabled]="!canShare()">
    <button uiToolbarButton (click)="share()">Share</button>
  </div>
  <a uiToolbarLink href="/help">Help</a>
  <input uiToolbarInput aria-label="Font size" value="12" />
</div>
```

## `uiToolbar`

`exportAs: "uiToolbar"`. Put it on an element around its items, and name it with `aria-label` or `aria-labelledby`.

| Input         | Type                                      | Core option                                                           |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `orientation` | `"horizontal" \| "vertical" \| undefined` | Which arrow keys move between items.                                  |
| `loop`        | `boolean \| undefined`                    | Whether arrow keys wrap; core's default `true`.                       |
| `disabled`    | `boolean \| undefined`                    | Stops every item; they stay focusable with `aria-disabled`.           |
| `controller`  | `ToolbarController \| undefined`          | From core's `createToolbarController()`, to focus it, say on Alt+F10. |
| `debug`       | `boolean \| undefined`                    | Logs state changes, in development builds.                            |

`state: Signal<ToolbarState>` is `{ orientation, disabled }`.

## Parts

| Directive            | `exportAs`           | Inputs                              | `state()`                   |
| -------------------- | -------------------- | ----------------------------------- | --------------------------- |
| `uiToolbarButton`    | `uiToolbarButton`    | `disabled`, `focusableWhenDisabled` | `{ disabled, orientation }` |
| `uiToolbarLink`      | `uiToolbarLink`      | none                                | `{ disabled, orientation }` |
| `uiToolbarInput`     | `uiToolbarInput`     | `disabled`, `focusableWhenDisabled` | `{ disabled, orientation }` |
| `uiToolbarGroup`     | `uiToolbarGroup`     | `disabled`                          | `{ disabled, orientation }` |
| `uiToolbarSeparator` | `uiToolbarSeparator` | none                                | `{ orientation }`           |

- **Items**: `uiToolbarButton` on a `<button>` (core gives other elements `role="button"`), `uiToolbarLink` on an `<a>`, `uiToolbarInput` on a text `<input>`, where arrow keys move the caret and leave the field only from the end they point at. Handle a button's press with your own `(click)`.
- **A disabled item stays focusable** with `aria-disabled`, so arrow keys still reach it and a tooltip can say why; `[focusableWhenDisabled]="false"` disables it natively and skips it. `uiToolbarGroup`'s `disabled` disables every item and toggle inside it, and the toolbar's disables all of them.
- **The separator** runs across the toolbar: `aria-orientation="vertical"` in a horizontal one.
- Every item finds its toolbar, and its group, through Angular's DI: put them under the toolbar's element in the template.

## Rules

- **Style by core's attributes**: `[data-disabled]`, `[aria-disabled="true"]`, `[data-orientation]`, and `tabindex="0"` on the item that holds the tab stop.
- **Bind `[disabled]`** rather than a static `disabled` attribute.
- **The server renders the toolbar final**: one tab stop, and nothing changes when it hydrates.
- **Other components' triggers can't be toolbar items yet.** A Select trigger, or any part of another component, on the same element as `uiToolbarButton` isn't supported; it sits outside the toolbar's arrow keys. Menubar isn't part of this release.
