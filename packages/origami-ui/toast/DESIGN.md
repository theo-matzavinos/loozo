# Toast design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 28.

```text
OrigamiToaster<T> (the consumer's @Service subclass)
 │  ToastStore: entries in add order, each { record, duration, status: waiting | shown | closing }
 │  add() ──untracked──▶ waiting; offers it to the registered region now, if any (nothing on the server)
 │  close(id) ──▶ waiting: dropped; shown: the region's close; closing or unknown: nothing
 └─ one region ──register(ngOnInit)──▶ a second region on the same toaster throws;
      its DestroyRef unregisters: shown ──▶ waiting (full duration), closing ──▶ dropped
OrigamiToastRegion   ToastRegionContext: paused (hover | focus within | document.hidden),
 │                   a timer per shown record, limit, focus-return target
 │   release: waiting ──▶ shown, oldest first, at offer and at register; then the limit closes the oldest open
 │   state.toasts = shown + closing, newest first
 └─ Toast ──register(ngOnInit), its record's id read live──▶ the region; Presence present = record shown
      host inert = record closing (its exit)
      Presence settled closed, or the Toast destroyed ──▶ region drops its closing record
      └─ Close ── click ──▶ the region's close of its Toast's record
```

The release is the region's one gate from waiting to shown, so a later hold (a modal dialog blocking the page) is a check in it and a re-run from the events that lift it, with no change of owner.

## Ownership

| Fact                     | Owner                                                                                                                                                           | Readers                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Records and their status | the toaster's `ToastStore`, a signal of immutable entries: written by `add` and `close` (any context, untracked) and by its region's release, close and drop    | the region's Context (release, close, limit, focus), Region State `toasts`, each Toast's `open` |
| Toast ids                | a module-level counter in `toaster.ts`, so ids are unique across toasters                                                                                       | the consumer, `close(id)`                                                                       |
| The toaster's region     | the store: set by the region's `ngOnInit` registration, cleared by its `DestroyRef`; a second registration throws                                               | `add` (offer) and `close`                                                                       |
| Bound toaster            | the effective `OrigamiToastRegionOptions.toaster`, read once at registration; the Context keeps that toaster's store in a signal                                | Region State, the Context                                                                       |
| Duration, limit          | the effective `OrigamiToastRegionOptions`; a toast's own `duration` in its entry                                                                                | the release                                                                                     |
| Paused                   | the region's Context: hover from host `pointerenter`/`pointerleave`; focus within read live (`focusin`/`focusout` supply it); the document's `visibilitychange` | the timers, in those events, at a release and after a Toast's or Close's view is destroyed      |
| Timers, remaining time   | the region's Context, one per shown record from its release to its close; cleared when the region is destroyed                                                  | timer callbacks, which close                                                                    |
| Mounted Toasts           | the region's Context: a list of `{ id, element }`, appended by each Toast's `ngOnInit`, removed by its `DestroyRef`                                             | the close (focus, and dropping a record no Toast renders)                                       |
| Toast open               | derived: its record's status is `shown`, through the region's Context                                                                                           | Toast State, its Presence `present`, its host `inert` (not open)                                |
| Exit settled             | the Toast's composed Presence                                                                                                                                   | the Toast Context's effect, which tells the region to drop the closing record                   |
| Close target             | Close's nearest Toast (DI)                                                                                                                                      | its click handler                                                                               |
| Focus-return target      | the region's Context: the `relatedTarget` of a host `focusin` from outside, or none                                                                             | the close, when the closing Toast contains the focused element                                  |

## Read timing

| Read                                     | Reader                                  | Phase                     | Platform | If the owner isn't initialized                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Region Options `toaster()`               | the Context's `register`                | `ngOnInit`                | both     | Inputs are set by then. Read once: a later rebinding isn't followed.                                                                                                                                                                 |
| Region Options `duration()`, `limit()`   | the release                             | event (offer), `ngOnInit` | browser  | Inputs are set: the release runs only once the region registered. An invalid value throws a `RangeError` before any status changes; `add` then removes its new record.                                                               |
| The store's entries                      | Region State `toasts`, Toast `open`     | render                    | both     | Before registration the Context has no store: `toasts` is empty and every Toast is closed. On the server nothing is ever added.                                                                                                      |
| The store's entries                      | the release, close, limit, focus return | event, timer, `ngOnInit`  | browser  | Untracked reads of the current entries.                                                                                                                                                                                              |
| Toast Options `toast()`                  | Toast `open`, its registration's `id`   | render; event             | both     | Own element: its required input is set before its host bindings. The id is read live, so a reused element follows its current record.                                                                                                |
| Mounted Toasts, `document.activeElement` | the close                               | event, timer              | browser  | A record whose Toast hasn't registered yet (before Angular renders it, such as one closed right after `add` or by the limit before the next render) has no Toast: it is dropped at once and never renders, and focus can't be in it. |
| Presence phase                           | the Toast Context's effect              | effect                    | browser  | `closed` only once an exit settled: a shown record's Presence never reports it, since a new Toast's record is shown. Focus still inside moves before the drop.                                                                       |
| `document.hidden`                        | the pause                               | event, release            | browser  | Read when the pause is synchronized.                                                                                                                                                                                                 |
| `document.activeElement`, `hasFocus()`   | the pause's focus within                | event, release, microtask | browser  | Read live, not cached: removing a focused element dispatches no `focusout`. A Toast's or Close's `DestroyRef` queues a microtask, after Angular removed its elements, that synchronizes the pause again.                             |
| `relatedTarget`                          | the focus-return target, focus-within   | event                     | browser  | None from a focus with nothing focused before: focus then returns to the region host.                                                                                                                                                |

`setTimeout`, `performance.now()` and focus moves run only in the browser, in events, timers and the registration's release, never during render or on the server.

## Refresh dependencies

- A released record renders on the next change detection, which the store's signal schedules under zoneless change detection. The Toast for it registers in that view's `ngOnInit`; until then the region treats the record as having no Toast, so a close in that window drops it and it never renders. Nothing tracks turns: registration is the only signal.
- A close changes the record's status before it moves focus, and the close writes nothing after the focus move; the limit counts the open records again before each further close: a focus listener that destroys the region finds the record closing and the store's teardown drops it. The next render turns the Toast's Presence `present` false and binds `data-leaving`. Presence settles in its after-render READ or when its animations finish; the Toast Context's effect then drops the record, and the render after that removes the consumer's view.
- The region registers in its `ngOnInit` and sets its store signal, so the consumer's `@for` over `state.toasts()` renders the released records in the same change detection pass or the next.
