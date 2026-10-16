# ToggleGroup design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 14.

## Ownership

| Fact                                                  | Owner                                                                                                                                               | Readers                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Value, disabled, orientation, `deselectable`          | the mode's Options (`OrigamiToggleGroupSingleOptions` or `…MultipleOptions`), on `ogToggleGroupSingle`/`Multiple` or the Toolbar's Toggle Groups    | the root Options the mode supplies through `ɵprovideRoot`                 |
| Disabled, orientation, pressed values, the write rule | `ToggleGroupRootOptions`, built from the mode Options; for a Toolbar Toggle Group the orientation is the Toolbar's                                  | `ToggleGroupContext` in `ɵOrigamiToggleGroupRoot`                         |
| An item's value, disabled                             | its `OrigamiToggleGroupItemOptions`                                                                                                                 | its `ToggleGroupItemContext`; the roving focus through its published item |
| An item's pressed state                               | derived: `root.selected(own value)`, a `linkedSignal` whose writes become root requests                                                             | the composed Toggle, as its Options                                       |
| Roving membership and tab stop                        | the nearest `ɵOrigamiRovingFocusContext`: the standalone root's own, or the Toolbar's for a Toolbar Toggle Group; each item publishes in `ngOnInit` | the item's `[tabindex]`                                                   |
| Roving policy (standalone)                            | `ownRovingFocus`: the root's orientation, `preferred` = the pressed values                                                                          | the roving Context                                                        |

## Read timing

| Read                           | Reader                    | Phase  | Platform | If the owner isn't initialized                                                                                     |
| ------------------------------ | ------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| Own value, root pressed values | the item's `pressed`      | render | both     | Safe: own inputs and an ancestor.                                                                                  |
| Root disabled, orientation     | root host bindings, items | render | both     | Safe: the root's own or an ancestor's Options. A Toolbar Toggle Group's orientation is the Toolbar's, an ancestor. |
| Roving tab stop                | item `[attr.tabindex]`    | render | both     | See the roving focus in [collection/DESIGN.md](../collection/DESIGN.md).                                           |
| Live disabled state            | `clicked()`               | event  | browser  | Safe.                                                                                                              |
