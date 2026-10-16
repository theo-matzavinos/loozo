# Accordion design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 9.

## Ownership

| Fact                                               | Owner                                                                                                      | Readers                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Selection, collapsible policy                      | the mode's Options (`OrigamiAccordionSingleOptions` or `…MultipleOptions`), through the mode's `Selection` | `AccordionContext`                                                               |
| Disabled                                           | `OrigamiAccordionOptions`                                                                                  | `AccordionContext`, every item                                                   |
| An item's value                                    | the item's Collection Item Options (by default the Accordion Item's own `value`)                           | its `AccordionItemContext`; `itemValues` through the published Collection record |
| An item's disabled state, hiding                   | the Accordion Item, through a private configuration token aliased to the composed Collapsible              | the Collapsible and its parts                                                    |
| An item's expanded state                           | derived: `root.selected(own value)`, a `linkedSignal` whose writes become root requests                    | the composed Collapsible, as its `expanded`                                      |
| An item's lock (Single, selected, not collapsible) | derived: `root.locked(own value)`                                                                          | the Trigger's `aria-disabled`                                                    |
| Item membership and order                          | the composed Collection; each item publishes in `ngOnInit`                                                 | `OrigamiAccordionState.itemValues`                                               |
| Trigger and Panel slots                            | the item's composed Collapsible; the composed Collapsible Trigger and Panel publish in `ngOnInit`          | as in [collapsible/DESIGN.md](../collapsible/DESIGN.md)                          |

## Read timing

| Read                      | Reader                             | Phase          | Platform | If the owner isn't initialized                                                                               |
| ------------------------- | ---------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Own value, root selection | the item's `expanded`, `locked`    | render         | both     | Safe: own inputs and an ancestor.                                                                            |
| Published items' values   | `itemValues`, read by applications | render, mostly | both     | Unpublished items aren't listed; later `@for` items join when they publish. A keyed move notifies no reader. |
| Trigger and Panel IDs     | the Collapsible parts              | render         | both     | As in [collapsible/DESIGN.md](../collapsible/DESIGN.md).                                                     |
