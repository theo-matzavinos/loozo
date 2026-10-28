# Menu

Menu is a list of actions that opens from a button, such as a row's "⋯" actions or a toolbar's "More": the [menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) pattern with an action [menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/). Focus moves into the menu: the arrows, typeahead and the mouse move it between the items, and activating one runs your `(select)` and closes the menu. Checkbox and radio items turn options on and off, such as a table's columns and density. The menu is a [Popover](../popover/README.md), so it's presented in the native top layer, positioned against the button and dismissed like one.

[src/menu/row-actions.ts](../snippets/src/menu/row-actions.ts "playground")

| Directive            | Configuration                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogMenu`             | `open: boolean` model (default `false`), `disabled` (default `false`)                                                                                         |
| `ogMenuTrigger`      | `id` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>`     |
| `ogMenuContent`      | `id` (default generated), `side` (default `block-end`), `align` (default `start`), `gap` (CSS px, default `0`), as on [Popover Content](../popover/README.md) |
| `ogMenuItem`         | `disabled` (default `false`), `label: string \| null` (default `null`); `(select)` output; must be a `<button>`                                               |
| `ogMenuCheckboxItem` | `checked: boolean` model (default `false`), `disabled` (default `false`), `label: string \| null` (default `null`); `(select)` output; must be a `<button>`   |
| `ogMenuRadioGroup`   | `value: string \| null` model (default `null`)                                                                                                                |
| `ogMenuRadioItem`    | `value: string` (required), `disabled` (default `false`), `label: string \| null` (default `null`); `(select)` output; must be a `<button>`                   |
| `ogMenuLink`         | `label: string \| null` (default `null`); `(select)` output; must be an `<a>`                                                                                 |
| `ogMenuGroup`        | none                                                                                                                                                          |
| `ogMenuGroupLabel`   | `id` (default generated)                                                                                                                                      |
| `ogMenuSeparator`    | none                                                                                                                                                          |

```html
<div ogMenu>
  <button ogMenuTrigger [attr.aria-label]="'Actions for ' + todo.title">⋯</button>
  <div ogMenuContent align="end" class="menu">
    <a ogMenuLink [routerLink]="['/todos', todo.id, 'edit']">Edit</a>
    <div ogMenuSeparator></div>
    <button ogMenuItem (select)="deleteOpen.set(true)">Delete…</button>
  </div>
</div>
<div ogAlertDialog [(open)]="deleteOpen">…</div>
```

```css
.menu:popover-open {
  display: flex;
  flex-direction: column;
}

/* The mouse moves real focus too, so :focus is the highlight. */
.menu [role="menuitem"]:focus {
  background: var(--hover);
  outline: none;
}

.menu [role="menuitem"][data-disabled] {
  opacity: 0.5;
}
```

Put the Trigger and Content inside `ogMenu`, and the items inside Content. Listen to `(select)`, not `(click)`: it runs when an item is activated by a click, Enter or Space, never for a disabled item.

- **Activation** focuses the Trigger, closes the menu, and only then emits `(select)`. So a [Dialog](../dialog/README.md) that your `(select)` opens records the Trigger as the element to return focus to: Cancel and Escape come back to the Trigger. Whatever your listener focuses, such as a dialog's `autofocus` or a page your router opens, wins. If the Trigger can't take focus, because you've removed or detached it, the menu still closes and emits, and your listener runs with focus wherever it was.
- **`open`** is the requested state. Opening, activation and dismissal write it, and you can write it yourself; a menu opened that way moves no focus, until ArrowDown or ArrowUp on the Trigger. Writing it after an opening, even false and back to true before the menu renders, cancels that opening if it hasn't focused its item yet. So does focus moving elsewhere, also from your `openChange` listener while the opening writes `open`: focus stays where it put it. Your listener writing false and back to true inside that write doesn't cancel it: the reopened menu still focuses the requested item.
- **`disabled`**, on `ogMenu` or on `ogMenuTrigger`, natively disables the Trigger, so the menu can't open from it, and an open menu closes when either becomes disabled. Your own writes still apply.

## Removing the row a menu belongs to

When an item deletes its own row, the row's Trigger goes with it, and nothing is left to return focus to: focus falls to the body. Move it yourself once the row is gone, to the next row's Trigger, to the previous one's after the last row, or, once no row is left, to the list itself, which you give `tabindex="-1"` and a name, as the playground above does:

```html
<ul #list tabindex="-1" aria-label="Todos">
  …
</ul>
```

```ts
private readonly list = viewChild.required<ElementRef<HTMLElement>>("list");
private readonly triggers = viewChildren(OrigamiMenuTrigger, { read: ElementRef });

remove(todo: Todo): void {
  const index = this.todos().indexOf(todo);
  const next = this.triggers()[index + 1] ?? this.triggers()[index - 1];

  this.todos.update((todos) => todos.filter((current) => current !== todo));
  afterNextRender(() => (next ?? this.list()).nativeElement.focus(), { injector: this.#injector });
}
```

Focusing it before the row goes doesn't work when you confirm in a modal Dialog: the rest of the page is inert until the dialog closes.

## Keyboard

Keys with Alt, Ctrl or Meta, keys already `defaultPrevented` and keys during IME composition are ignored.

| Where            | Key                     | Action                                                                                                                          |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Trigger, closed  | Enter, Space, ArrowDown | open and focus the first item                                                                                                   |
| Trigger, closed  | ArrowUp                 | open and focus the last item                                                                                                    |
| Trigger, opening | Enter, Space            | nothing: the menu keeps opening on the item it was opened for                                                                   |
| Trigger, open    | ArrowDown / ArrowUp     | focus the first / last item                                                                                                     |
| Trigger, open    | Enter, Space            | close                                                                                                                           |
| item             | ArrowDown / ArrowUp     | the next / previous item; it wraps                                                                                              |
| item             | Home / End              | the first / last item                                                                                                           |
| item             | characters              | typeahead: the next item whose `label`, else its text, starts with what you typed; repeating one character cycles through them  |
| item             | Enter, Space            | activate: focus the Trigger, close, emit `(select)`; on a disabled item, nothing. Space types a space while a search is running |
| checkable item   | Space                   | toggle or select it; the menu stays open                                                                                        |
| checkable item   | Enter                   | toggle or select it and close: focus the Trigger, close, write, emit `(select)`                                                 |
| item             | Escape                  | close and focus the Trigger                                                                                                     |
| item             | Tab, Shift+Tab          | close; focus moves on from the Trigger's place in the page, after or before it                                                  |

Disabled items are reached by the arrows and typeahead, as the APG asks, but don't activate. Characters typed within 500 ms of each other form one search, matched against the start of an item's `label`, else its text with whitespace collapsed, ignoring case. Separators and group labels aren't items: the keys skip them.

Every item has `tabindex="-1"`, so an open menu adds no Tab stop: Tab from an item leaves the menu from its Trigger, wherever Content sits in the DOM.

## Pointer

A click on the Trigger opens or closes the menu, focuses the Trigger, also in Safari, which doesn't focus a clicked button, unless your listener moved focus elsewhere, and a menu it opens focuses its first item once it's shown. Moving the mouse over an item focuses it, a disabled one too; touch and pen don't. After a key, the mouse moves focus again only once it actually moves: an item scrolling under a still cursor doesn't take focus. Clicking an item activates it. A click outside closes the menu and leaves focus where you clicked.

## Links

`ogMenuLink` goes on your own `<a>`, which keeps its `href`, `routerLink`, `target` and `download`. Enter, Space and a plain click follow the link and close the menu, with `(select)`, in the same order as an item. A click with Ctrl, Cmd, Shift or Alt, or with the middle button, keeps the menu open and lets the browser open a tab or a window. The link never prevents a click's default, so `routerLink` always runs.

A link has no `disabled`: an anchor can't stop `routerLink` from navigating. Show an unavailable destination as a disabled `ogMenuItem` instead.

## Disabled items

A disabled `ogMenuItem` is a focusable disabled [Button](../button/README.md): `aria-disabled="true"` and `data-disabled`, never native `disabled`, so it stays in the arrow and typeahead order. It never emits `(select)` and doesn't close the menu. Your own `(click)` on it still runs, as on any focusable disabled button, which you can use to explain why it's unavailable.

## Groups and separators

```html
<div ogMenuContent>
  <div ogMenuGroup>
    <span ogMenuGroupLabel>Sort by</span>
    <button ogMenuItem (select)="sort('name')">Name</button>
    <button ogMenuItem (select)="sort('date')">Date</button>
  </div>
  <div ogMenuSeparator></div>
  <button ogMenuItem (select)="reset()">Reset</button>
</div>
```

A group is `role="group"`, named by its labels through `aria-labelledby`. A separator is `role="separator"`. Neither takes focus.

## Checkbox and radio items

```html
<div ogMenuContent class="menu">
  <div ogMenuGroup>
    <span ogMenuGroupLabel>Columns</span>
    <button ogMenuCheckboxItem #owner="ogMenuCheckboxItem" label="Owner" [(checked)]="showOwner">
      <span aria-hidden="true">{{ owner.state.checked() ? "✓" : "" }}</span> Owner
    </button>
    <button ogMenuCheckboxItem [(checked)]="showDue">Due date</button>
  </div>
  <div ogMenuSeparator></div>
  <div ogMenuRadioGroup [(value)]="density">
    <span ogMenuGroupLabel>Density</span>
    <button ogMenuRadioItem value="compact">Compact</button>
    <button ogMenuRadioItem value="comfortable">Comfortable</button>
  </div>
</div>
```

`ogMenuCheckboxItem` is `role="menuitemcheckbox"` with `aria-checked` from its `checked` model. `ogMenuRadioItem` is `role="menuitemradio"` inside an `ogMenuRadioGroup`, checked while the group's `value` is its `value`; the group is `role="group"`, named by its `ogMenuGroupLabel`s like `ogMenuGroup`. A checked item has `data-checked`, and its `state.checked()`, through a `#item="ogMenuCheckboxItem"` or `"ogMenuRadioItem"` reference, can draw your indicator. If the indicator is text at the start of the item, give the item a `label` for typeahead.

- **Space and a click** toggle a checkbox item or select a radio item, and the menu stays open with focus on the item, so you can change several in a row. Your `(checkedChange)`, `(valueChange)` and `(select)` run in that order, with focus on the item.
- **Enter** toggles or selects the item and closes the menu, in the same order as an action: focus moves to the Trigger, the menu closes, the state is written and `(select)` runs. Your change and `(select)` listeners run with focus on the Trigger and `open` false. The menu handles Enter on the key press itself, so the button gets no `click` event for it: listen to `(select)`, `(checkedChange)` or `(valueChange)`, not `(click)`.
- **Any click**, also your own script's `click()`, toggles or selects the item and keeps the menu open, like a pointer click. Only the Enter key closes.
- **Selecting the checked radio item** writes nothing, so a radio group never clears; `(select)` still runs and Enter still closes. To start with nothing checked, leave `value` null.
- **Disabled** checkable items stay focusable and reachable, like disabled items: they write and emit nothing and keep the menu open, while your own `(click)` on them still runs.
- The arrows, typeahead and the mouse only move focus: they never check anything. Holding Space toggles once, when you release it.

## Inside a Toolbar, a Dialog or a Popover

Inside a [Dialog](../dialog/README.md) or Popover Content, the first Escape and a click elsewhere in it close only the menu, and activating an item keeps the enclosing layer open. A [Tooltip](../tooltip/README.md) Trigger can share the button with `ogMenuTrigger`; the Tooltip closes when the menu takes focus.

A menu's items have their own focus, separate from an `ogToolbar`'s arrows, but `ogMenuTrigger` isn't a Toolbar control: there's no Toolbar variant of it yet.

## Items that come and go

Content stays mounted while the menu is closed, so its items are registered before it opens. Items inside `@for`, `@if` or `@defer` register once Angular has set their inputs and unregister when they're destroyed; an item that isn't mounted, or that is in a `@defer` block that hasn't hydrated yet, can't be reached. While a menu opened from the Trigger has no item that takes focus yet, Content itself holds focus (`tabindex="-1"`), and the first item to arrive takes it, unless focus has moved anywhere but the Trigger or the menu meanwhile, even if it came back. For a heavy menu, render the items only while it's open, with `@if (content.state.open())` on a `#content="ogMenuContent"` reference.

## Replacing Options

The root, Trigger, Content, item, checkbox item, radio group, radio item, link and group label each have their own Options, `OrigamiMenuOptions`, `OrigamiMenuTriggerOptions`, `OrigamiMenuContentOptions`, `OrigamiMenuItemOptions`, `OrigamiMenuCheckboxItemOptions`, `OrigamiMenuRadioGroupOptions`, `OrigamiMenuRadioItemOptions`, `OrigamiMenuLinkOptions` and `OrigamiMenuGroupLabelOptions`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. To wrap an item in your own directive, compose it through `hostDirectives` and expose what you need:

```ts
@Directive({
  selector: "button[appMenuItem]",
  hostDirectives: [
    { directive: OrigamiMenuItem, inputs: ["disabled", "label"], outputs: ["select"] },
  ],
})
export class AppMenuItem {}
```

See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiMenuState`, the root's `state` and also the Trigger's, has `open()`, whether the menu is actually presented and interactive, not the requested `open` (false on the server and during an exit), and `disabled()`, the root's effective disabled policy. Content's `state.open()` is its Presence retention, as on Popover Content. Each item has `OrigamiMenuItemState` as `state`: `disabled()` and `select`, an `Observable` of its activations; descendants of an item can inject it. A checkbox item has `OrigamiMenuCheckboxItemState` and a radio item `OrigamiMenuRadioItemState`, each with `checked()`, `disabled()` and `select`. Links, groups, radio groups, group labels and separators have no `state`.

| Element                   | Attributes                                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger                   | `type="button"`, `aria-haspopup="menu"`, `id`, `aria-expanded`, `aria-controls` (mounted Content); the disabled attributes of [Button](../button/README.md)                                                                                  |
| Content                   | `role="menu"`, `tabindex="-1"`, `id`, `aria-labelledby` (the Trigger, once it's mounted), `popover="manual"`, `inert` while not presented, the [Presence](../presence/README.md) attributes, `--og-anchor-width` and `--og-available-height` |
| Item                      | `type="button"`, `role="menuitem"`, `tabindex="-1"`; when disabled, `aria-disabled="true"` and `data-disabled`                                                                                                                               |
| Checkbox item, radio item | `type="button"`, `role="menuitemcheckbox"` or `role="menuitemradio"`, `tabindex="-1"`, `aria-checked`; when checked, `data-checked`; when disabled, `aria-disabled="true"` and `data-disabled`                                               |
| Link                      | `role="menuitem"`, `tabindex="-1"`                                                                                                                                                                                                           |
| Group, radio group        | `role="group"`, `aria-labelledby` (its labels, once they're mounted)                                                                                                                                                                         |
| Group label               | `id`                                                                                                                                                                                                                                         |
| Separator                 | `role="separator"`                                                                                                                                                                                                                           |

## Accessibility

- Name the Trigger: its text, or `aria-label` on an icon button. The menu takes the Trigger's name.
- Give items readable text and, where the text starts with an icon or a shortcut, a `label` for typeahead.
- No screen reader session has been run yet: how NVDA and VoiceOver announce the menu hasn't been verified.

## Server rendering and hydration

Server HTML has the menu closed: the Trigger's `aria-haspopup`, `aria-expanded="false"` and `aria-controls`, Content's `role`, `tabindex` and `aria-labelledby`, and the items' roles, `tabindex="-1"`, disabled attributes and, for checkbox and radio items, `aria-checked` and `data-checked` from your values. Hydration keeps the nodes and IDs. A click on the Trigger replayed after incremental hydration opens the menu once on its first item. Keyboard interaction before hydration isn't promised.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No submenus yet, no mixed checkbox state, no `disabled` on a radio group, no menubar, context menu, press-drag-release, shortcut or indicator parts, `closeOnSelect`, `loop` or `modal` options, and no disabled links.
