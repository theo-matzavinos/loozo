# Dialog

Dialog is a modal dialog on the browser's native `<dialog>`: Content is shown with `showModal()`, in the top layer above a `::backdrop`, with the rest of the page inert until it closes. Content stays where you author it.

[src/dialog/filters-sheet.ts](../snippets/src/dialog/filters-sheet.ts "both")

| Part                  | Configuration                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogDialog`            | `open` model (default `false`), `dismissible` (default `true`)                                                                                                      |
| `ogAlertDialog`       | the same as `ogDialog`, for an [alert dialog](#alert-dialogs); use one root or the other                                                                            |
| `ogDialogTrigger`     | `id` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>`; optional |
| `ogDialogContent`     | `id` (default generated), `returnFocus` (default `null`); must be a `<dialog>`                                                                                      |
| `ogDialogTitle`       | `id` (default generated)                                                                                                                                            |
| `ogDialogDescription` | `id` (default generated)                                                                                                                                            |
| `ogDialogClose`       | `disabled`, `focusableWhenDisabled` (both default `false`); must be a `<button>`                                                                                    |

The Trigger is optional: any control that writes `open` opens the Dialog, such as an ordinary `ogButton` with `(click)="filtersOpen.set(true)"`. One Trigger and one Content are supported per Dialog; Titles, Descriptions and Close buttons can repeat. The root may sit on the `<dialog>` itself (`<dialog ogDialog ogDialogContent>`), and a component can be the root through `hostDirectives: [OrigamiDialog]` and close itself with `inject(OrigamiDialog).open.set(false)`. Such a component can also be [opened from code](#opening-from-code).

```html
<button ogButton (click)="filtersOpen.set(true)">Filters</button>

<div ogDialog [(open)]="filtersOpen">
  <dialog ogDialogContent>
    <h2 ogDialogTitle>Filters</h2>
    <p ogDialogDescription>Narrow the list.</p>
    <form (submit)="apply($event)">…<button type="submit">Apply</button></form>
    <button ogDialogClose aria-label="Close">×</button>
  </dialog>
</div>
```

## Opening and closing

- **Opening.** Once `open` is true and Content is connected, Origami calls `showModal()` after Angular renders. Never author or bind the `open` attribute: it makes a `<dialog>` non-modal. The browser picks initial focus: an `autofocus` element, else the first focusable one, else the dialog. Chrome also counts a scroll container that overflows, such as a long body, as focusable, so it would focus the body before the fields inside it; Origami then moves focus to the first element in the dialog that takes it, as Firefox and Safari choose. With a `tabindex` on the scroller, the choice stays the browser's: Chrome and Safari focus the scroller, Firefox the first field. The correction looks only at the dialog's own elements, not into shadow roots, and can't see a component that moves focus into its own closed shadow root while opening. Put `autofocus` on the safe choice, such as Cancel, and use `[autofocus]` for a dynamic one.
- **Closing.** Close buttons, writes to `open` and accepted dismissals all set `open` to false. Content then runs its exit animation while the dialog **stays modal**: the page stays inert and focus stays inside until the animation ends, then `close()` runs. Reopening during the exit keeps the same dialog open. Open Popovers and Tooltips inside are hidden as soon as the close starts; one that was already closing finishes its own exit, and is gone by the time the dialog closes.
- **Escape** closes whatever Origami showed last inside the Dialog: a Popover or Tooltip inside, also projected or slotted into the `<dialog>` or in a component's shadow root inside it (see [Nesting](#nesting)), closes first, the next Escape closes the Dialog. A Popover or Tooltip outside it, even one your code opens later, is inert like the rest of the page and never takes it. The browser's close requests (the back gesture, `requestClose()`) are handled exactly the same way, Tooltips included. The exception is `requestClose()` on a Dialog with another Dialog open above it: it closes the Dialog you called it on, with any Popover inside, and leaves the newer one open.
- **Backdrop.** A click on the backdrop closes the Dialog, but not a drag that starts inside it. If a Popover inside is open, the click closes only that Popover. An [alert dialog](#alert-dialogs) never closes on a backdrop click. Origami handles this itself in every browser and doesn't set `closedby`.
- **`dismissible`** set to false blocks Escape, close requests and backdrop clicks. Close buttons and writes to `open` still close it. Use it, for example, while a request is pending.
- **Closes Origami doesn't start**, such as a `<form method="dialog">` submit or calling `close()` on the element, write `open` false at once, without the exit animation. Content State `open` turns false and gated children leave without waiting for Content's animations, even mid-exit.

During the exit the dialog still takes Escape, close requests and backdrop clicks without acting on them, so nothing behind it reacts, and the Popovers and Tooltips hidden inside keep their `open`.

## Alert dialogs

An alert dialog interrupts to ask for a decision, such as confirming a delete. Use `ogAlertDialog` as the root instead of `ogDialog`, with the same parts. It works like a Dialog, except:

- Content gets `role="alertdialog"`, also in the server's HTML.
- A backdrop click never closes it, so a stray click can't count as an answer. An open Popover inside still closes on it. Escape and the browser's close requests still close it unless `dismissible` is false.

Cancel is an `ogDialogClose`: give it `autofocus`, so the safe choice has focus when the dialog opens. The Action is your own button. It doesn't close the dialog, so you can keep the dialog open while the request runs and show what went wrong if it fails, then close it by writing `open` once the request succeeds. Disable both buttons and set `dismissible` to false while the request is pending:

[src/dialog/delete-invoice.ts](../snippets/src/dialog/delete-invoice.ts "both")

`OrigamiAlertDialog` has its own Options, `OrigamiAlertDialogOptions` (`open`, `dismissible`), and exposes the Dialog root's State as its `state`. A component can be the root through `hostDirectives: [OrigamiAlertDialog]` and expose its `open`, `openChange` and `dismissible`.

## Opening from code

To open a dialog from a handler, such as a search dialog a page opens with its current criteria, write the dialog as an application component that is the Dialog root through `hostDirectives` (or the AlertDialog root), and open it with an opener:

[src/dialog/invoice-search.ts](../snippets/src/dialog/invoice-search.ts "both")

- **The opener.** Call `injectOrigamiDialogOpener(Component)` once in an injection context, such as a field initializer; the component or service that calls it owns it. Its `open()` can run anywhere later. Each call mounts a new instance of the component and returns an `OrigamiDialogRef`.
- **Bindings.** `open()` takes a record of the component's signal inputs, models and outputs, by property name and typed from their declarations: an input takes a getter or a signal, which keeps it live; a model takes a getter, bound one-way, or a `WritableSignal`, bound two-way; an output takes a listener. Plain fields and decorator `@Input()`s and `@Output()`s can't be bound. The type can't tell required inputs apart, so leaving one out throws Angular's NG0950 when the component reads it. Inputs aren't set while the component is constructed, so seed state from them with `linkedSignal` or `computed`, not in a field initializer.
- **Where it lives.** The component's host is appended to the document body, and the component injects from the opener's owner, so it sees the providers the page sees. Theme variables set on `<html>` reach it; ones set on an element inside the page don't.
- **Opening and closing.** Its top-level Dialog root opens once the component first renders. It closes like any Dialog, from inside (a Close button, a write to its root's `open`, Escape, the backdrop) or from outside with `ref.close()`. After the exit animation the component is destroyed and its host removed, then `ref.closed` resolves; await it to learn the dialog is gone. Data leaves through outputs: there's no close result. A `close()` before the first render tears it down without showing it.
- **Navigation and teardown.** A URL change through Angular's `Location`, as the router navigates or on the back button, closes every dialog the opener has open, with their exit. When the owner is destroyed, its dialogs are torn down at once, without an exit, newest first, and focus returns as after any close.
- **Server rendering.** `open()` throws on the server, so call it from browser events. A dialog that must be in the server's HTML is a template Dialog.

A component opened from code can open another one with its own opener, such as an alert dialog confirming a discard: the newer one stacks above it. If the outer one ends while the newer one is still open, because its owner is destroyed or `ref.close()` finishes its exit, the newer one is torn down first, without an exit, and focus returns to where it was before the outer one opened.

## Focus

When the dialog closes, the browser returns focus to what had it before it opened. Then:

- `returnFocus`, if set and it can take focus, gets focus instead. Use it when the opener is gone, such as the delete button of a row the dialog deleted. A disconnected, disabled or inert element can't.
- Otherwise, if focus was lost, the first of these that can take focus gets it: what had focus before this dialog opened, then, down the stack of dialogs it was opened over, each one's `returnFocus` and what had focus before it opened, and last the Trigger, unless it's disabled. Focus is lost when it ended up on the page body, for example because Safari doesn't focus a clicked button or the element is gone, or when the browser had nothing to restore and left it inside the closed dialog, also inside a shadow root.

Stacked dialogs can close in any order. A dialog that closes while one opened after it is still open moves no focus, since the page is inert under the newer one; it keeps its `returnFocus` and its place in the stack. When the newer one closes, focus returns down the stack past it, for example to the page button that opened the first dialog when navigation closes both and the first one's shorter exit ends first.

If Content is removed while modal, for example by a list refresh that removes the row hosting it, the dialog closes at once without an exit, and focus is returned the same way. `open` keeps its value.

## Names and descriptions

Content's `aria-labelledby` names its Titles, in the order they were created, also when a child component renders them. Without a Title, your own `aria-labelledby` or `aria-label` on the `<dialog>` is kept. Descriptions inside Content go into `aria-describedby`, shared with other describers on the element, such as a [Tooltip](../tooltip/README.md) Trigger. Describe the dialog with short text, not a whole form. A [Field](../field/README.md) inside works as anywhere else.

## Nesting

What's inside a Dialog is decided by where its elements end up in the page, not by where you declare them: a Popover, Tooltip or Dialog is inside when its parts are inside the `<dialog>`, including through a wrapper component's `<ng-content>`, a shadow root, or a `<slot>`. With Dialogs inside Dialogs, it belongs to the innermost.

A Popover or Tooltip inside is shown only while the Dialog is open. An open one is hidden, keeping its own `open`, when the Dialog starts closing, and shown again when it reopens; one that was already closing finishes its own exit and is gone by the time the dialog closes. A Popover inside counts as part of the Dialog for Escape and outside clicks. A Dialog opened from inside another stacks above it: the newer one is modal and the older one goes inert until it closes. Don't author a Dialog inside Popover Content.

### Wrapper components

A component that is the root through `hostDirectives` can render the `<dialog>` in its own template and take the dialog's body from its users, with `<ng-content>` or, under `ViewEncapsulation.ShadowDom`, with a `<slot>`. Popovers, Tooltips and Dialogs passed in nest in it exactly as if they were written inside Content:

```ts
@Component({
  selector: "app-sheet",
  imports: [OrigamiDialogContent],
  hostDirectives: [{ directive: OrigamiDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `<dialog ogDialogContent class="sheet"><ng-content /></dialog>`,
})
export class Sheet {}
```

```html
<app-sheet [(open)]="filtersOpen">
  <h2 ogDialogTitle>Filters</h2>
  <div ogPopover>…</div>
</app-sheet>
```

Origami reads this from the page when the Popover or Tooltip updates and when you press a key or click, so moving an element in or out of the `<dialog>` without changing anything Angular tracks, such as editing a `slot` attribute by hand, takes effect from the next update.

Close a Dialog nested in another before the outer one, or together with it. Users can't close the outer one first, since it's inert, but your code can, for example by writing the outer `open` or calling `requestClose()` on it. The browser then keeps the inner dialog modal but not rendered, which blocks the page, so when the outer dialog closes after its exit, Origami reports the error through Angular's `ErrorHandler` if the inner one is still open, and leaves both as you set them. Closing both together is fine, in either order within one turn: if the inner exit outlasts the outer one, it ends when the outer dialog closes. Opening the inner one during the outer exit is the same error.

## Scroll lock

While any Origami dialog is open, `<html>` gets an inline `overflow: hidden`; the inline `overflow-x` and `overflow-y` it had before come back when the last one closes. Hiding the scrollbar can shift the page: reserve its space with `scrollbar-gutter: stable` on `html` if that matters.

## Styling and animation

You style Content and its `::backdrop`. Presence's `data-entering`, `data-present` and `data-leaving` mark the phases; the exit waits for Content's own animations only, so keep a backdrop animation within Content's. If you change Content's `display`, scope it to `[open]` so the closed dialog stays hidden.

### Sheet

A sheet is a Dialog styled against an edge, with no option of its own. Remove the browser's centering and size it to the edge, then slide it with Presence's attributes:

```css
.sheet {
  margin-inline-start: auto;
  margin-block: 0;
  block-size: 100dvh;
  max-block-size: none;
  inline-size: min(20rem, 100vw);
}

.sheet[data-entering] {
  animation: slide 200ms ease-out;
}

.sheet[data-leaving] {
  animation: slide 200ms ease-in reverse forwards;
}

@keyframes slide {
  from {
    translate: 100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet[data-entering],
  .sheet[data-leaving] {
    animation: none;
  }
}
```

`translate` is physical: in a right-to-left page, slide from `-100%` and use `margin-inline-end`. For a block-edge sheet, use `margin-block-start: auto` and `translate: 0 100%`.

## Replacing Options

Every part has its own Options: `OrigamiDialogOptions` (`open`, `dismissible`), `OrigamiAlertDialogOptions` with the same properties for `ogAlertDialog`, `OrigamiDialogTriggerOptions` (`id`, `disabled`, `focusableWhenDisabled`), `OrigamiDialogContentOptions` (`id`, `returnFocus`), `OrigamiDialogTitleOptions` and `OrigamiDialogDescriptionOptions` (`id`), and `OrigamiDialogCloseOptions` (`disabled`, `focusableWhenDisabled`). A replacement must supply every property. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiDialogState` has `open()`, the requested state, which turns false as soon as a close starts, and `dismissible()`; `ogAlertDialog` exposes it too. `OrigamiDialogContentState.open()` is Presence's: true through the exit, so gate children on it to keep them while the dialog animates out.

| Element            | Attributes                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | `type="button"`, `id`, `aria-expanded` (the requested state), `aria-controls` (while Content is mounted), the disabled attributes                                                                               |
| Content            | `id`, `aria-labelledby` (Titles), `aria-describedby` (Descriptions), Presence's attributes; the browser adds `open` while modal; `role="alertdialog"` under `ogAlertDialog`, otherwise no `role`; no `tabindex` |
| Title, Description | `id`                                                                                                                                                                                                            |
| Close              | `type="button"`, the disabled attributes                                                                                                                                                                        |

## Server rendering and hydration

The server renders Content without `open`, so it's hidden, with its IDs, names and, while requested open, `data-present` and the children you gate on its State. After hydration a requested-open Dialog opens modally, without replaying its entrance; under incremental hydration, only once its `@defer` block hydrates. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No non-modal dialog (use a [Popover](../popover/README.md)), `position` option or Sheet primitive, overlay part, portal or container option, initial-focus option, close result or data token for dialogs opened from code, alert dialog Action part, drawer or swipe to dismiss.
