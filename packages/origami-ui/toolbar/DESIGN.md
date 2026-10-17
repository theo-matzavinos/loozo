# Toolbar design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 15.

## Ownership

| Fact                                                  | Owner                                                                                                                                                    | Readers                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Orientation                                           | root `OrigamiToolbarOptions`, through `ToolbarContext`                                                                                                   | the root's host bindings; the roving policy; Toolbar Toggle Groups' root Options                           |
| An item's disabled state                              | its `OrigamiToolbarItemOptions`                                                                                                                          | the item; the roving focus through its registered item                                                     |
| Roving membership and tab stop                        | the Toolbar's `ɵOrigamiRovingFocusContext`; Toolbar items and the items of Toolbar groups, which provide no roving focus, register with it in `ngOnInit` | each control's `[tabindex]`                                                                                |
| Roving policy                                         | the Toolbar's `ɵOrigamiRovingFocusOptions`: its orientation, `preferred` = `[]`                                                                          | the roving Context                                                                                         |
| A Toolbar group's selection, disabled state and State | the group's own Options, through the composed `ɵOrigamiToggleGroupRoot` or `ɵOrigamiRadioGroupRoot`                                                      | the group's items (see [toggle-group](../toggle-group/DESIGN.md), [radio-group](../radio-group/DESIGN.md)) |
| That a Toolbar group has a Toolbar                    | `ToolbarContext`, injected at construction                                                                                                               | DI: a Toolbar group outside a Toolbar fails there                                                          |

## Read timing

| Read                | Reader                                                                  | Phase  | Platform | If the owner isn't initialized                                                                     |
| ------------------- | ----------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------- |
| Toolbar orientation | root host bindings; Toolbar Toggle Groups' `data-orientation` and State | render | both     | Safe: the root's own Options, or an ancestor's.                                                    |
| Own disabled        | item host bindings                                                      | render | both     | Safe.                                                                                              |
| Roving tab stop     | each control's `[attr.tabindex]`                                        | render | both     | Registered controls only; see the roving focus in [collection/DESIGN.md](../collection/DESIGN.md). |
| Live disabled state | `clicked()`                                                             | event  | browser  | Safe.                                                                                              |
