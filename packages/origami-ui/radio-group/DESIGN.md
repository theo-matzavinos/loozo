# RadioGroup design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 16.

## Ownership

| Fact                                               | Owner                                                                                                                                                                      | Readers                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Checked value, disabled                            | `OrigamiRadioGroupOptions`, on `ogRadioGroup` or `ogToolbarRadioGroup`                                                                                                     | `RadioGroupContext` in `ɵOrigamiRadioGroupRoot`                                                                                                                                            |
| An item's value, disabled, focusable when disabled | its `OrigamiRadioGroupItemOptions`                                                                                                                                         | the item; the roving focus through its registered item; the composed `ogButton`, which owns the disabled attributes, through the Button Options the item supplies with the root's disabled |
| An item's checked state                            | derived: root value equals own value                                                                                                                                       | the item's `aria-checked`, `data-checked`                                                                                                                                                  |
| Roving membership and tab stop                     | the nearest `ɵOrigamiRovingFocusContext`: `ogRadioGroup`'s own, or the Toolbar's for `ogToolbarRadioGroup`; each item registers in `ngOnInit`                              | the item's `[tabindex]`                                                                                                                                                                    |
| Roving policy (standalone)                         | `ogRadioGroup`'s `ɵOrigamiRovingFocusOptions`: orientation `"both"`, `preferred` = `[value]` or `[]`                                                                       | the roving Context                                                                                                                                                                         |
| What a keyboard navigation means                   | `RadioGroupContext`, subscribed to the `navigations` of a roving Context on its own element: only `ogRadioGroup` provides one, so only a standalone group checks on a move | —                                                                                                                                                                                          |

## Read timing

| Read                       | Reader                                        | Phase  | Platform | If the owner isn't initialized                                           |
| -------------------------- | --------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| Own value, root value      | the item's `checked`                          | render | both     | Safe: own inputs and an ancestor.                                        |
| Root disabled              | root host bindings; the item's Button Options | render | both     | Safe.                                                                    |
| Roving tab stop            | item `[attr.tabindex]`                        | render | both     | See the roving focus in [collection/DESIGN.md](../collection/DESIGN.md). |
| Own Options, root disabled | `activate()`                                  | event  | browser  | Safe; rechecked after `focus()`.                                         |
