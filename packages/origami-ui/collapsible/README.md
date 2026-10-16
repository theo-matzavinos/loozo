# Collapsible

Collapsible is a disclosure: a native button that shows and hides one panel.

[src/collapsible/details.ts](../snippets/src/collapsible/details.ts "playground")

The root has an `expanded` model (default `false`), a `disabled` input (default `false`) and a `hiding` input (default `"hidden"`). A Collapsible supports one Trigger and one Panel; either may be missing, which removes its ARIA association. They can be rendered by different components: each names the other's ID once Angular has set the other's inputs, so the server HTML already has the bound IDs.

## Replacing Options

Root, Trigger and Panel each have their own Options. This root replacement makes `until-found` its own default:

[src/collapsible/searchable-section.ts](../snippets/src/collapsible/searchable-section.ts)

## State and attributes

`OrigamiCollapsibleState` has `expanded()` and `disabled()`, the effective values from the root Options.

| Element | Attributes                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-expanded`, `data-disabled`                                                                                                                                                       |
| Trigger | `type="button"`, `id`, `aria-expanded`, `aria-controls` (only while a Panel is mounted), `data-expanded`; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |
| Panel   | `id`, `aria-labelledby` (only while a Trigger is mounted), `data-expanded`, `hidden` once collapsed, and Presence's `data-entering`, `data-present` and `data-leaving`                 |

`data-expanded` follows the requested state, not the exit animation: it's removed as soon as the panel starts closing. The Panel stays visible through its finite exit animation and gets `hidden` once Presence closes.

## Accessibility

- The Trigger is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click toggles `expanded`. While disabled, user clicks can't change it, but your own writes to the model or Options still apply.
- You supply the heading, any `role="region"` on the Panel, and the content's semantics. The Panel's `aria-labelledby` names the Trigger.
- `hiding="until-found"` lets the browser's find-in-page reveal collapsed content where `beforematch` is supported; the reveal expands the Collapsible. Elsewhere it behaves like `hidden`, with no polyfill. A disabled Collapsible uses plain `hidden`, so find-in-page can't expand it.

## Limitations

`until-found` is a progressive enhancement and falls back to `hidden` without find-in-page.
