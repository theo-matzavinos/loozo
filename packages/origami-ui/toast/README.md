# Toast

Toasts are short notifications your code raises from anywhere, such as "Invoice saved" after a request, shown in one polite live region that you author once. A toast outlives what raised it: it survives the component that added it being destroyed, and router navigation. You decide what a toast holds, such as a title, a description and a kind, and how it looks; Origami keeps the records, times them and moves focus.

[src/toast/app-toasts.ts](../snippets/src/toast/app-toasts.ts "both")

| Part             | Configuration                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `OrigamiToaster` | abstract class, generic over your toast data; declare one `@Service()` subclass per kind of toast                               |
| `ogToastRegion`  | the toaster, bound as `[ogToastRegion]` (required), `duration` (default `5000` ms), `limit` (default `3`)                       |
| `ogToast`        | the record, bound as `[ogToast]` (required)                                                                                     |
| `ogToastClose`   | `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>` |

## The toaster

`OrigamiToaster<T>` has no decorator and no default `T`. Declare your toast data and a subclass once, then inject the subclass wherever a toast is raised: a component, an effect, a mutation callback, a functional HTTP interceptor or a service.

```ts
export interface AppToast {
  title: string;
  description?: string;
  kind: "success" | "info" | "warning" | "error";
}

@Service()
export class AppToasts extends OrigamiToaster<AppToast> {}
```

```ts
const toasts = inject(AppToasts);

toasts.add({ title: "Todo created", kind: "success" });
toasts.add({ title: "Error", description: detail, kind: "error" }, { duration: 8000 });

const id = toasts.add({ title: "Uploading…", kind: "info" }, { duration: Infinity });

toasts.close(id);
```

- **`add(data, options?)`** returns the toast's id, `og-toast-<n>`, unique in the application. `data` is kept by reference as the record's `data`: Origami never reads, copies or freezes it, so don't mutate it after adding. The only option is `duration`, in milliseconds, a positive number or `Infinity`; anything else throws a `RangeError`. With a registered region, `add` also throws the region's `RangeError` for an invalid `duration` or `limit`; a throwing `add` keeps nothing. A wrong `data` shape is a compile error.
- **`close(id)`** closes that toast with its exit. An unknown id, or one already closing, does nothing.
- On the server `add` keeps nothing and returns an id that matches nothing, so an HTTP interceptor that adds error toasts doesn't break server rendering. Server HTML never contains a toast.

Toasts are typed through the region too: Angular infers the region's `T` from its `[ogToastRegion]` binding, so in `@for (toast of region.state.toasts(); …)` a misspelled `toast.data.titel` is a strict-template error.

Use one toaster per kind of toast, each with its own region. A toaster no region binds keeps its toasts, waiting, for the application's lifetime; nothing checks that a declared toaster is rendered somewhere.

## The region

Author the region once, usually in your root component, so it's in the server's HTML before any toast exists: a live region announces reliably only when it exists before its content is added. Name it with `aria-label` or `aria-labelledby`; Origami ships no default label. Render `state.toasts()`, newest first, with `track toast.id`, and put `ogToast` on each toast's element.

The region gets `role="region"`, `aria-live="polite"`, `aria-relevant="additions text"`, `aria-atomic="false"` and `tabindex="-1"`. Adding a toast's element to the region is its announcement; don't give a toast `role="status"` or `role="alert"`, which would re-read every toast or read one twice. A toast's whole text is read, its Close button's name included ("Todo created, Close"). Every toast is polite: it waits for the screen reader's current speech, errors included.

One region per toaster: a second region bound to the same toaster throws when it registers. The region reads its toaster once, when it registers; binding another toaster later isn't followed.

- **Waiting.** A toast added before the region mounts, or while the region is still dehydrated in a `@defer` block, waits and is shown once the region registers. Its time starts then.
- **Region destroyed.** Its shown toasts go back to waiting, with their full duration, and toasts running their exit are dropped: a region mounted again doesn't show them.

## Timers and pausing

Each toast closes after its `duration`: its own, else the region's, read when the region shows it. `Infinity` never closes.

The region pauses every toast while the pointer is over it, while focus is inside it and while the document is hidden, such as in a background tab. When it resumes, each toast continues with the time it had left. A window that merely loses focus, with another window in front, doesn't pause it. Hover is tracked by `pointerenter` and `pointerleave`, so when the toast under a still pointer is removed, the region stays paused until the pointer moves. Focus inside is checked again when your template removes an `ogToast` or an `ogToastClose` holding it, unless an Angular leave animation (`animate.leave`) keeps the element in the page past that check; when it removes another focused element inside a toast, the region stays paused until the next pointer, focus or visibility change on it.

Pausing on hover and focus doesn't help screen-reader users browsing with the virtual cursor. Auto-dismissal is acceptable under WCAG 2.2.1 only when the information is also available elsewhere, such as in the list the toast reports on; that's yours to provide. Use `{ duration: Infinity }` for a toast someone must act on.

## Limit

`limit` counts the open toasts. When showing a toast takes the open toasts over it, the oldest open toast closes with its exit. If you add more toasts than `limit` in one handler, the oldest of them close before Angular renders them, so they never render. It's a positive integer or `Infinity`; anything else throws a `RangeError` when the region shows a toast.

To set `duration` and `limit` for the whole application, wrap the region in your own directive and [replace its Options](#replacing-options).

## Closing and removal

A toast closes when its time runs out, on its Close button, on `close(id)` and by the limit. Its State `open()` turns false, its composed Presence runs the exit (`data-leaving`), and once the exit settles the region drops the record, which removes the element from your `@for`. Without an animation, also under reduced-motion CSS, it's removed at once. While its exit runs, the toast is `inert`. A toast closed before its `ogToast` registers, that is before Angular renders it, such as one you `close` right after `add`, is dropped at once and never renders.

There is no Escape, swipe or hotkey.

## Focus

A toast never takes focus. When a toast that contains focus closes, focus moves right after its State `open()` turns false, before its exit starts:

- to what had focus before focus entered the region, when no other toast stays open and that element still takes focus;
- otherwise to the region, from which Tab reaches the other toasts' controls: the closing toast is `inert` through its exit, so Tab skips it.

A focus listener there that destroys the region finds the toast already closing, so a region mounted afterwards, also inside that listener, doesn't show it.

## Styling and animation

Position the region yourself, such as `position: fixed` in a corner, and order it against the rest of the page with `z-index`. It isn't in the top layer, so open Popovers, Menus, Selects, Tooltips and Dialogs paint above it. Use `$index` for a stacked look and `:hover` or `:focus-within` on the region to expand the stack.

Toasts compose [Presence](../presence/README.md): animate `[data-entering]` and `[data-leaving]`, and handle reduced motion in your CSS.

## Modal dialogs

The browser makes everything outside a modal dialog inert, toasts included: a toast raised while a dialog is open, or shown when one opens, renders behind the backdrop, isn't announced and can't be clicked or focused until the dialog closes. Under a fullscreen element, toasts are inert the same way.

## Replacing Options

Each part has an Options class, which a directive or component that composes the part through `hostDirectives` can replace:

| Part   | Options                     | Properties                          |
| ------ | --------------------------- | ----------------------------------- |
| Region | `OrigamiToastRegionOptions` | `toaster`, `duration`, `limit`      |
| Toast  | `OrigamiToastOptions`       | `toast`                             |
| Close  | `OrigamiToastCloseOptions`  | `disabled`, `focusableWhenDisabled` |

See [Options](../README.md#how-the-primitives-fit-together) for `provideExisting` and `provideFactory`.

## State and attributes

`ogToastRegion` exposes `OrigamiToastRegionState` as `state`: `toasts()`, the shown toasts, newest first, including those running their exit. `ogToast` exposes `OrigamiToastState`: `open()`, false from the close request on, while the exit runs. Close has no `state`.

| Element | Attributes                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Region  | `role="region"`, `aria-live="polite"`, `aria-relevant="additions text"`, `aria-atomic="false"`, `tabindex="-1"` |
| Toast   | Presence's attributes, `inert` while it runs its exit; no role or live attributes                               |
| Close   | `type="button"`, the disabled attributes                                                                        |

## Server rendering and hydration

The server renders the region with its attributes and an empty list, so the live region exists before any toast. Eager and incremental hydration keep the region and its list. A region still dehydrated in a `@defer (hydrate …)` block isn't registered yet; toasts added meanwhile wait and are shown once it hydrates.

## Not included

No action or cancel part, `update`, promise or loading toasts, deduplication, callbacks or a `closed` promise, hotkey, Escape, swipe, pause on window blur, measured heights or offsets for a collapsed stack, top-layer presentation, several regions or positions per toaster, default label, component content, `ariaNotify` or assertive priority.
