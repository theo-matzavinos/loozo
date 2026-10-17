# Tabs design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 13.

## Ownership

| Fact                                              | Owner                                                                                      | Readers                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Selected value, disabled, orientation, activation | root `OrigamiTabsOptions`, through `TabsContext`                                           | every part (an ancestor read)                                                                  |
| A Trigger's value, ID, disabled                   | its `OrigamiTabsTriggerOptions`                                                            | the Trigger; Panels through the Trigger registry; the roving focus through its registered item |
| A Panel's value, ID                               | its `OrigamiTabsPanelOptions`                                                              | the Panel; Triggers through the Panel registry                                                 |
| Trigger and Panel registries                      | `TabsContext.#triggers` / `#panels`, written by each part's registration in `ngOnInit`     | `triggerId(value)`, `panelId(value)`                                                           |
| Roving membership and tab stop                    | the root's `ɵOrigamiRovingFocusContext`; each Trigger registers with it in `ngOnInit`      | the Trigger's `[tabindex]`                                                                     |
| Roving policy                                     | the root's `ɵOrigamiRovingFocusOptions`: Tabs orientation, `preferred` = `[value]` or `[]` | the roving Context                                                                             |
| What a keyboard navigation means                  | `TabsContext`, subscribed to `navigations`: selects while activation is automatic          | —                                                                                              |

## Read timing

| Read                                   | Reader                             | Phase  | Platform | If the owner isn't initialized                                                                                                   |
| -------------------------------------- | ---------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Registered Panels' `value()`, `id()`   | Trigger `[attr.aria-controls]`     | render | both     | A Panel in a later `@for` or component isn't registered yet: no attribute, filled in when it registers. Server HTML is complete. |
| Registered Triggers' `value()`, `id()` | Panel `[attr.aria-labelledby]`     | render | both     | As above, mirrored.                                                                                                              |
| Own Options, root value                | Trigger `selected`, Panel `hidden` | render | both     | Safe: own inputs and an ancestor.                                                                                                |
| Roving tab stop                        | Trigger `[attr.tabindex]`          | render | both     | See the roving focus in [collection/DESIGN.md](../collection/DESIGN.md).                                                         |
| Own Options, root disabled             | `activate()`                       | event  | browser  | Safe; rechecked after `focus()`.                                                                                                 |
| `activation()`                         | the `navigations` subscription     | event  | browser  | Safe.                                                                                                                            |
