# Button design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 17.

## Ownership

| Fact                                                        | Owner                                                                                                                                                                                                        | Readers                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Disabled, focusable when disabled                           | the effective `OrigamiButtonOptions` on the same element: `ogButton`'s own inputs, a consumer replacement, or the composing part's factory (its root's or its own disabled, its own `focusableWhenDisabled`) | Button's host bindings; the Toolbar control on the same element |
| `type`, native `disabled`, `aria-disabled`, `data-disabled` | Button's host bindings, the only binding of each on the element                                                                                                                                              | the DOM                                                         |
| Whether an activation acts                                  | the composing part's own guard, from its own Options and its root's                                                                                                                                          | the part's click handler; Button has none                       |

## Read timing

| Read                         | Reader                                                    | Phase                     | Platform               | If the owner isn't initialized                                                                                                            |
| ---------------------------- | --------------------------------------------------------- | ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Own element's Button Options | host bindings                                             | render                    | both                   | Safe: the same element. A composing part's factory reads that part's own Options and its ancestors' Options and State, never a sibling's. |
| Own element's Button Options | the Toolbar control's registration, tab stop, `clicked()` | `ngOnInit`, render, event | both; event in browser | Safe: the same element, read through `injectDeferred` after construction.                                                                 |

## Refresh dependencies

None beyond the signals: a change to the effective disabled state or `focusableWhenDisabled` re-renders the host bindings in the same pass as the part's own bindings.
