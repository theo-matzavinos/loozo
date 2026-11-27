# Collapsible

Collapsible is a disclosure: a native button that shows and hides one panel.

[src/collapsible/details.ts](../snippets/src/collapsible/details.ts "playground")

The root has an `expanded` model (default `false`), a `disabled` input (default `false`) and a `hiding` input (default `"hidden"`). The Trigger has its own `disabled` and `focusableWhenDisabled` inputs (both default `false`); it's disabled while either it or the root is. A Collapsible supports one Trigger and one Panel; either may be missing, which removes its ARIA association. They can be rendered by different components: each names the other's ID once Angular has set the other's inputs, so the server HTML already has the bound IDs.

## Replacing Options

Root, Trigger and Panel each have their own Options. This root replacement makes `until-found` its own default:

[src/collapsible/searchable-section.ts](../snippets/src/collapsible/searchable-section.ts)

## State and attributes

`OrigamiCollapsibleState` has `expanded()` and `disabled()`, the effective values from the root Options. Neither State nor the root's `data-disabled` includes the Trigger's own `disabled`. The Panel exposes its composed `OrigamiPresenceState` as `state` (`#panel="ogCollapsiblePanel"`); gate content on `panel.state.open()` to keep it through the exit animation.

| Element | Attributes                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-expanded`, `data-disabled`                                                                                                                                                                                        |
| Trigger | `type="button"`, `id`, `aria-expanded`, `aria-controls` (only while a Panel is mounted), `data-expanded`; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled` |
| Panel   | `id`, `aria-labelledby` (only while a Trigger is mounted), `data-expanded`, `hidden` once collapsed, and Presence's `data-entering`, `data-present` and `data-leaving`                                                  |

`data-expanded` follows the requested state, not the exit animation: it's removed as soon as the panel starts closing. The Panel stays visible through its finite exit animation and gets `hidden` once Presence closes.

## Accessibility

- The Trigger is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click toggles `expanded`. While disabled, user clicks can't change it, but your own writes to the model or Options still apply.
- `focusableWhenDisabled` keeps a disabled Trigger in the Tab order, so keyboard and screen reader users can still find it: it gets `aria-disabled="true"` instead of native `disabled`. Origami ignores its activation, but the browser still dispatches its clicks, so your own `(click)` listeners on the button still run.
- You supply the heading, any `role="region"` on the Panel, and the content's semantics. The Panel's `aria-labelledby` names the Trigger.
- `hiding="until-found"` lets the browser's find-in-page reveal collapsed content where `beforematch` is supported; the reveal expands the Collapsible. Elsewhere it behaves like `hidden`, with no polyfill. A disabled Collapsible uses plain `hidden`, so find-in-page can't expand it.
- Native form validation reaches collapsed content in either hiding mode. When a form without `novalidate` is submitted, or `reportValidity()` runs, and its first invalid control is inside a collapsed Panel, the Collapsible expands before the browser reports that control, so the browser can focus it and show its message, unless something else keeps the control hidden. Only that control's Panels expand, so a Single Accordion opens the item holding the first error. The first invalid control is read from the form, so if your code cancels an earlier field's `invalid` event, or hides that field itself, later sections stay collapsed and focusing their fields is up to you. A disabled Collapsible stays collapsed. Keep required fields mounted: a field gated on `panel.state.open()` isn't in the form while collapsed, so the browser doesn't validate it. `checkValidity()` fires the same `invalid` event and expands the Panel too; read `validity.valid` to check silently. If your code expands a Collapsible and validates in the same turn, let Angular render the expansion first, or let validation open it.

## Limitations

`until-found` is a progressive enhancement and falls back to `hidden` without find-in-page.
