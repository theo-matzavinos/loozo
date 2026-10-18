# Popover design map

Ownership and read timing between parts. Usage is in the [README](README.md); the contract is SPEC section 10 and [SPEC-POPOVER.md](../SPEC-POPOVER.md). The presentation machine inside `PopoverContext` runs in effects, render hooks and events, never in a part's host bindings, and isn't mapped here.

## Ownership

| Fact                                        | Owner                                                                                               | Readers                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Open intent, disabled, dismissible          | root `OrigamiPopoverOptions`, through `PopoverContext`                                              | every part (an ancestor read); the presentation machine                         |
| Trigger ID                                  | `OrigamiPopoverTriggerOptions`                                                                      | the Trigger; an Anchor on the same element through the Trigger slot             |
| Trigger disabled                            | `OrigamiPopoverTriggerOptions`, combined with the root's disabled                                   | the Trigger; focus restoration through the Trigger slot                         |
| Anchor ID                                   | `OrigamiPopoverAnchorOptions`                                                                       | the Anchor, unless it shares the Trigger's element                              |
| Content ID, side, align, gap                | `OrigamiPopoverContentOptions`                                                                      | Content; the Trigger's `aria-controls` and positioning through the Content slot |
| One Trigger, Anchor and Content             | `PopoverContext` slots, set by each part's registration in `ngOnInit`; a second registration throws | `parts`, `contentId`, `anchorId`, the presentation machine                      |
| Participation                               | `PopoverContext`: shown and accepted as current, with ancestors requested                           | Trigger `aria-expanded`, Content `inert`                                        |
| Nesting                                     | the parent `PopoverContext`, by DI `skipSelf`                                                       | dismissal, branch capture, presentation                                         |
| Document-level dismissal and stacking order | `PopoverParticipants`, an application `@Service`                                                    | every Popover                                                                   |

## Read timing

| Read                                    | Reader                                            | Phase                | Platform                         | If the owner isn't initialized                                                                                         |
| --------------------------------------- | ------------------------------------------------- | -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Registered Content `id()`               | Trigger `[attr.aria-controls]`                    | render               | both                             | Content in a child component isn't registered yet: no attribute, filled in when it registers. Server HTML is complete. |
| Registered Trigger `id()`               | an Anchor on the Trigger's element                | render               | both                             | Both parts register in the same element's `ngOnInit`, before its host bindings.                                        |
| Root Options, participation             | Trigger and Content host bindings                 | render               | both                             | Safe: an ancestor's, or the Context's own.                                                                             |
| Own Trigger Options disabled            | Trigger host bindings and `activate()`            | render, event        | both; event in browser           | Safe: its own.                                                                                                         |
| Registered Trigger Options disabled     | focus restoration                                 | event, effect        | browser                          | Safe: no restoration without a registered Trigger.                                                                     |
| Registered Content Options for position | the synchronizing `effect` and `afterEveryRender` | effect, after render | browser (the server stops early) | Safe.                                                                                                                  |
