# Collection design map

Ownership and read timing for Collection and the package-private roving focus, which share this entry point. Usage is in the [README](README.md); the contracts are SPEC sections 3, 4 and 6.

## Collection

### Ownership

| Fact            | Owner                                                                                                                  | Readers                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Membership      | `CollectionContext.#members`, written by each item's `publish()` in `ngOnInit` and removed by that item's `DestroyRef` | `ordered()`, and through it `OrigamiCollectionState.items` |
| An item's value | the item's effective `OrigamiCollectionItemOptions`, read lazily through its record's `value` `computed`               | `items()` readers: Accordion `itemValues`, applications    |
| Order           | the DOM, sorted by `compareDocumentPosition` on every `ordered()` call                                                 | `items`, which caches it until membership changes          |

### Read timing

| Read             | Reader                     | Phase          | Platform | If the owner isn't initialized                                                                                                                                                     |
| ---------------- | -------------------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#members`       | `items`                    | render, mostly | both     | Unpublished items aren't members: a reader sees an item once its inputs are set, never its default value. Later `@for` items join when they publish, which notifies readers again. |
| `record.value()` | `items()` readers          | render         | both     | Records exist only for published items, whose inputs are set.                                                                                                                      |
| DOM positions    | `ordered()` inside `items` | render         | both     | Not tracked: a keyed move that keeps membership doesn't re-run `items` (approved contract).                                                                                        |

## Roving focus (`ɵOrigamiRovingFocusContext`)

### Ownership

| Fact                                | Owner                                                                                     | Readers                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Orientation and preferred values    | the widget root, through `ɵOrigamiRovingFocusOptions` provided beside the Context         | `#tabStop`, `#keydown`                               |
| Membership                          | `#members`, written by each item's `publish()` in `ngOnInit`, removed by its `DestroyRef` | `#ordered()`, `#tabStop`, repair, guards             |
| A member's value and disabled state | the item's own Options, passed as signals to `item()`                                     | `#tabStop`, `targetOf`, guards                       |
| The focused member                  | `#focused`, from the item's focus and blur handlers                                       | `#tabStop`, repair                                   |
| Tab stop                            | derived: focused, else first enabled preferred, else first enabled, in DOM order          | each item's `tabStop` → its `[tabindex]`             |
| A keyboard navigation               | `navigations`, a `Subject` emitted in `#keydown` after `focus()`, under the guards        | Tabs (automatic activation), a standalone RadioGroup |

### Read timing

| Read                                         | Reader                                       | Phase         | Platform | If the owner isn't initialized                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| members' `value()`, `disabled()`             | `#tabStop`, through each item's `[tabindex]` | render        | both     | Only published members are read, so their inputs are set. A member rendered before a later preferred sibling publishes is the tab stop until it does, then the signal update re-renders it: "not there yet, then correct". |
| root `orientation()`, `preferred()`          | `#tabStop`, `#keydown`                       | render, event | both     | The root is an ancestor: its inputs are set first.                                                                                                                                                                         |
| DOM positions                                | `#ordered()` in `#tabStop`                   | render        | both     | Not tracked: the fallback order is read when membership, focus, disabled state, values or preference change.                                                                                                               |
| DOM positions                                | `#ordered()` in `#keydown`                   | event         | browser  | Current DOM order.                                                                                                                                                                                                         |
| `#focused`, `#members`                       | repair `afterRenderEffect`                   | after render  | browser  | Safe.                                                                                                                                                                                                                      |
| `isConnected`, `disabled()`, `activeElement` | blur microtask                               | microtask     | browser  | Safe.                                                                                                                                                                                                                      |
