# Slider design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 29.

```text
OrigamiSlider (root)   OrigamiSliderOptions: value, min, max, step, disabled
 │                     SliderContext: grid (min, max, step), writable policy, Track and Thumb slots,
 │                     the live drag, touches; FORM_FIELD on the root's element (readonly)
 │   host: --og-slider-percent, data-disabled, data-dragging      state: OrigamiSliderState
 ├─ Track ──register(ngOnInit)──▶ track slot (a second throws)
 │    pointerdown ──▶ press: focus the Thumb; live and writable: capture the pointer, set the drag
 │    pointermove ──▶ the drag's pointer writes; pointerup / pointercancel / lostpointercapture ──▶ end
 └─ Thumb ──register(ngOnInit)──▶ thumb slot (a second throws); Field membership (labelledby,
      describedby, invalid, readonly) with the root's FORM_FIELD as its form state
      keydown ──▶ the key's allowed value; blur ──▶ touch
```

Every user write goes through the Context's one guarded write: dropped after destruction, while not writable (disabled, form readonly, invalid grid) and when equal to the current value.

## Ownership

| Fact                            | Owner                                                                                                                                                                                                                                    | Readers                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| value, min, max, step, disabled | the effective `OrigamiSliderOptions` on the root (own inputs and model, or a replacement); `[formField]` writes `value`, `disabled`, `min`, `max`                                                                                        | the Context's computeds: grid, writable, `now`, `percent`, `dragging`                         |
| Grid                            | the Context: `sliderGrid(min ?? 0, max ?? 100, step)`, null for an invalid configuration                                                                                                                                                 | `now`, `percent`, keys, the pointer's value, writable                                         |
| Form readonly                   | the `FORM_FIELD` on the root's element (`self`, optional)                                                                                                                                                                                | the Context's writable policy; the Thumb's membership (`aria-readonly`) through `formState()` |
| Track element                   | the Track's registration, set in its `ngOnInit`, cleared by its `DestroyRef`                                                                                                                                                             | the press (identity check), the drag                                                          |
| Thumb element                   | the Thumb's registration, set in its `ngOnInit`, cleared by its `DestroyRef`                                                                                                                                                             | `focus()`, the press (grab detection and focus)                                               |
| Live drag                       | the Context: `{ track, pointerId, offset, rtl }`, set by a live writable press, cleared by its pointer's release, cancel or lost capture, by a policy change, by its Track's or the Thumb's unregistration and by the root's destruction | moves, releases, `dragging` (root `data-dragging`, State)                                     |
| Field membership                | the Thumb (`ɵOrigamiFieldMembership`, `labelable: false`)                                                                                                                                                                                | the nearest Field                                                                             |
| Touch                           | the Context's subject, fed by the Thumb's `blur`                                                                                                                                                                                         | the root's `touch` output                                                                     |

## Read timing

| Read                            | Reader                                                 | Phase                                      | Platform | If the owner isn't initialized                                                                                                                |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Options                    | the Context's computeds → root host, Thumb host, State | render                                     | both     | The root's own or replaced Options, ancestors of every part: set before the parts' host bindings.                                             |
| `FORM_FIELD` `readonly()`       | the writable policy                                    | event, and render only while a drag exists | both     | Absent without `[formField]`: not readonly. Read only in events after the parts' `ngOnInit`, or for `dragging` while a drag exists (browser). |
| `FORM_FIELD` state              | the Thumb's membership (`aria-readonly`)               | render                                     | both     | Read only while the Thumb is its Field's control, after it registered in `ngOnInit`.                                                          |
| Track registration              | the press, the drag                                    | event (pointer)                            | browser  | Unregistered: a press does nothing, so no pointer input.                                                                                      |
| Thumb registration              | `focus()`, the press                                   | event                                      | browser  | Unregistered: `focus()` does nothing and a press writes without focusing or grab detection.                                                   |
| Track `getBoundingClientRect()` | the press (grab offset, value), each move              | event (pointerdown, pointermove)           | browser  | Read at the event. A zero-width Track writes nothing.                                                                                         |
| Track computed `direction`      | the press, kept for the drag                           | event (pointerdown)                        | browser  | n/a                                                                                                                                           |
| Thumb computed `direction`      | ArrowLeft, ArrowRight                                  | event (keydown)                            | browser  | n/a                                                                                                                                           |
| `eventPhase`                    | the press, moves, releases, keys                       | event                                      | browser  | `EventPhase.REPLAY` or `Event.NONE` is a replayed event: no `preventDefault()`, no capture, no drag; moves and releases ignored.              |

Nothing reads layout or direction during render or on the server; `--og-slider-percent` and the Thumb's value attributes are pure functions of the Options.

## Refresh dependencies

- No user write depends on a view refreshing: the press, moves and keys read the current Options and policy at the event. The press checks again after focusing the Thumb: the root's `DestroyRef`, the Track registration, the effective Options and the bound field's `readonly()` as they stand after its focus listeners. A listener that writes a replacement Options signal or the `readonly()` source stops it; a template binding (`[disabled]`, a `disabled()` rule's source) or an `@if` around the root or the Track takes effect only at the next change detection, after the press.
- Input bindings (`[disabled]`, `[min]`, `[max]`, `[step]` and `[formField]`'s writes) reach the Options when Angular refreshes the binding view, as for every primitive; a key or press before that acts on the previous configuration.
- A policy change (disabled, form readonly, invalid configuration) ends a live drag at the first event of its pointer (a move ends it before writing) or the first change detection (an effect), whichever comes first. A change reverted before either isn't observed and the drag goes on; signals give no synchronous change hook. `dragging` reads false while the policy blocks writes, without waiting for either.
