# Collection

Collection tracks the items mounted under it, in rendered DOM order. It's the ordering layer under Accordion, and you can use it directly when your own component needs to know which items exist and in what order.

[src/collection/sections.ts](../snippets/src/collection/sections.ts "both")

Each item has a `value` input. Without one it gets a generated value that's stable while the item is mounted and across hydration; pass explicit values when they mean something in your domain. Values are opaque strings and aren't normalized.

## Replacing item Options

[src/collection/tag.ts](../snippets/src/collection/tag.ts)

## State

`OrigamiCollectionState.items()` is a readonly array of records, each with a readonly `value` signal. Order follows the DOM, not construction order: keyed moves, insertions and removals show up after the render that made them. Changing an item's value updates its record without replacing it. Server rendering produces the same order without browser APIs.

Nested Collections are independent: an inner Collection's items don't appear in the outer one.

## Accessibility

Collection adds no attributes, roles, selection or keyboard behavior. Give the container and items the semantics your use needs, such as a list.
