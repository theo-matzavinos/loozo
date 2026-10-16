# Collapsible design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 8.

## Ownership

| Fact                       | Owner                                                                                             | Readers                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Expanded, disabled, hiding | root `OrigamiCollapsibleOptions`, through `CollapsibleContext`                                    | every part (an ancestor read)                             |
| Trigger ID                 | `OrigamiCollapsibleTriggerOptions`                                                                | the Trigger; the Panel through the published Trigger slot |
| Panel ID                   | `OrigamiCollapsiblePanelOptions`                                                                  | the Panel; the Trigger through the published Panel slot   |
| One Trigger, one Panel     | `CollapsibleContext` slots, set by each part's `publish()` in `ngOnInit`; a second publish throws | `triggerId`, `panelId`                                    |
| The Panel's presence       | Presence, with `present` = the root's expanded state                                              | the Panel's `hidden`                                      |
| `until-found` support      | the Panel element (`"onbeforematch" in host`), checked at construction                            | the Panel's `hidden`, `beforematch`                       |

## Read timing

| Read                     | Reader                         | Phase  | Platform | If the owner isn't initialized                                                                                                        |
| ------------------------ | ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Published Panel `id()`   | Trigger `[attr.aria-controls]` | render | both     | A Panel in a later sibling view or component isn't published yet: no attribute, filled in when it publishes. Server HTML is complete. |
| Published Trigger `id()` | Panel `[attr.aria-labelledby]` | render | both     | As above, mirrored.                                                                                                                   |
| Root Options             | every part                     | render | both     | Safe: an ancestor.                                                                                                                    |
| Root disabled, expanded  | `activate()`, `beforeMatch()`  | event  | browser  | Safe.                                                                                                                                 |
