# Collapsible design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 8.

## Ownership

| Fact                                      | Owner                                                                                                   | Readers                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Expanded, disabled, hiding                | root `OrigamiCollapsibleOptions`, through `CollapsibleContext`                                          | every part (an ancestor read)                                                                                                          |
| Trigger ID                                | `OrigamiCollapsibleTriggerOptions`                                                                      | the Trigger; the Panel through the Trigger slot                                                                                        |
| Trigger disabled, focusable when disabled | `OrigamiCollapsibleTriggerOptions`, combined with the root's disabled                                   | the Trigger's activation guard; the Button Options it supplies to its composed `ogButton`, the only binding of each disabled attribute |
| Panel ID                                  | `OrigamiCollapsiblePanelOptions`                                                                        | the Panel; the Trigger through the Panel slot                                                                                          |
| One Trigger, one Panel                    | `CollapsibleContext` slots, set by each part's registration in `ngOnInit`; a second registration throws | `triggerId`, `panelId`                                                                                                                 |
| The Panel's presence                      | Presence, with `present` = the root's expanded state                                                    | the Panel's `hidden`; applications through the Panel's `state` (Presence's State)                                                      |
| `until-found` support                     | the Panel element (`"onbeforematch" in host`), checked at construction                                  | the Panel's `hidden`, `beforematch`                                                                                                    |

## Read timing

| Read                               | Reader                                                                             | Phase  | Platform | If the owner isn't initialized                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registered Panel `id()`            | Trigger `[attr.aria-controls]`                                                     | render | both     | A Panel in a later sibling view or component isn't registered yet: no attribute, filled in when it registers. Server HTML is complete. |
| Registered Trigger `id()`          | Panel `[attr.aria-labelledby]`                                                     | render | both     | As above, mirrored.                                                                                                                    |
| Root Options                       | every part                                                                         | render | both     | Safe: an ancestor.                                                                                                                     |
| Own Trigger Options, root disabled | the composed Button's disabled host bindings, through the Trigger's Button Options | render | both     | Safe: its own and an ancestor's.                                                                                                       |
| Root disabled, expanded            | `activate()`, `beforeMatch()`                                                      | event  | browser  | Safe.                                                                                                                                  |
| Own Trigger disabled               | `activate()`                                                                       | event  | browser  | Safe: its own.                                                                                                                         |
