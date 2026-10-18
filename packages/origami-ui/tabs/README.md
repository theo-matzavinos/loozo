# Tabs

Tabs shows one panel at a time, chosen from a list of native buttons with arrow-key navigation.

[src/tabs/demo-views.ts](../snippets/src/tabs/demo-views.ts "both")

| Directive       | Configuration                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogTabs`        | `value: string \| null` model (default `null`), `disabled` (default `false`), `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`), `activation` (`"automatic"` or `"manual"`, default `"automatic"`) |
| `ogTabsList`    | none                                                                                                                                                                                                                    |
| `ogTabsTrigger` | `value` (default generated), `id` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>`                                  |
| `ogTabsPanel`   | `value` (default generated), `id` (default generated)                                                                                                                                                                   |

Give each Trigger and its Panel the same explicit `value`; a generated value pairs with nothing. Values should be distinct within one Tabs.

- Clicking an enabled Trigger, or pressing Enter or Space on it, selects its value. Selecting the selected tab does nothing; there's no deselection.
- The value is yours, and Tabs never selects a first tab for you. A Panel is visible exactly when its value is the root value, whether or not a Trigger with that value is mounted. So `null` hides every Panel, a value no Trigger or Panel has selects nothing and hides every Panel, and removing the selected Trigger keeps the value while its Panel stays visible.
- Root and Trigger `disabled` combine. While disabled, user clicks and keys can't change the selection; your own writes still apply.

## Keyboard

| Key                    | Horizontal                                              | Vertical                |
| ---------------------- | ------------------------------------------------------- | ----------------------- |
| ArrowRight / ArrowLeft | next / previous Trigger, reversed in right-to-left text | nothing                 |
| ArrowDown / ArrowUp    | nothing                                                 | next / previous Trigger |
| Home / End             | first / last Trigger                                    | first / last Trigger    |

Moves skip disabled Triggers, except focusable ones, and wrap at both ends. With `activation="automatic"` an arrow, Home or End move selects the Trigger it lands on, even the one already focused, unless it's disabled; with `"manual"` focus moves only, and Enter or Space selects. Focus that arrives by Tab, pointer or script doesn't select. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored. Direction comes from the Trigger's computed `direction` when the key is pressed, so `dir` on any ancestor works.

Only one Trigger is in the Tab order (`tabindex="0"`): the focused one while focus is in the list, otherwise the first selected enabled Trigger, otherwise the first enabled Trigger, otherwise the first focusable disabled Trigger. Tabbing back into the list lands on the selected tab. "First" reads DOM order whenever Triggers mount or unmount or focus, disabled state or the selection changes; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. A click focuses the Trigger it selects in every browser, so the next arrow key moves from there. If the focused Trigger is removed or natively disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without selecting it; one that becomes disabled but stays focusable keeps focus.

## Replacing Options

Root, Trigger and Panel each have their own Options. Here the selection lives in an application service, and the Trigger derives its ID from its value:

[src/tabs/settings-tabs.ts](../snippets/src/tabs/settings-tabs.ts)

Other parts read a Trigger's or Panel's Options only after Angular has set its inputs, so replacement Options can use required inputs, also in Triggers and Panels repeated with `@for`.

## State and attributes

`OrigamiTabsState` has `value()`, `disabled()`, `orientation()` and `activation()`, the effective values from the root Options. The root exposes it as `state`; use it to render a Panel's heavy content only while that Panel is selected.

| Element | Attributes                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-orientation`, `data-disabled`                                                                                                                                                                                                                                                                     |
| List    | `role="tablist"`, `aria-orientation`                                                                                                                                                                                                                                                                    |
| Trigger | `role="tab"`, `type="button"`, `id`, `aria-selected` (`"true"` or `"false"`), `aria-controls` (only while a Panel with its value is mounted), `tabindex`, `data-selected` while selected; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled` |
| Panel   | `role="tabpanel"`, `tabindex="0"`, `id`, `aria-labelledby` (only while a Trigger with its value is mounted), `hidden` unless selected, `data-selected` while selected                                                                                                                                   |

## Accessibility

- You supply the List's accessible name with `aria-label` or `aria-labelledby`, and each Trigger's label.
- A Panel is a tab stop (`tabindex="0"`), so its content is reachable even when it has nothing focusable. Write a static `tabindex="-1"` on a Panel whose content starts with a focusable element.
- A disabled Trigger is natively disabled, so it can't be focused, unless it's `focusableWhenDisabled`: then arrows and clicks focus it without selecting it, and your own `(click)` listeners on it still run. A disabled selected Trigger stays `aria-selected="true"` and shows its Panel.
- There's no typeahead, `aria-activedescendant` or enter/exit animation on Panels, and Tabs isn't a form control. A Tabs inside a Panel is independent of the outer one.

## Server rendering and hydration

Tabs' selection, roles, associations, hidden Panels and single `tabindex="0"` are in the server HTML, also when Triggers and Panels repeat in `@for`, and hydration doesn't change them.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
