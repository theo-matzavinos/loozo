# Collection

Collection tracks the items mounted under it, in DOM order. It's the ordering layer under Accordion, and you can use it directly when your own component needs to know which items exist and in what order.

[src/collection/sections.ts](../snippets/src/collection/sections.ts "both")

Each item has a `value` input. Without one it gets a generated value that's stable while the item is mounted and local to the application, so it isn't guaranteed to match across hydration; pass explicit values when they mean something in your domain or must survive hydration. Values are opaque strings and aren't normalized.

## Replacing item Options

[src/collection/tag.ts](../snippets/src/collection/tag.ts)

## State

`OrigamiCollectionState.items()` is a readonly array of records, each with a readonly `value` signal. An item appears once Angular has set its inputs, so you never see its default value in place of a bound one. Order follows the DOM, not construction order, as of the latest insertion or removal: those read the items' current DOM positions. A keyed move that keeps the same items doesn't notify readers, so `items()` keeps its previous order until the next insertion or removal. Changing an item's value updates its record without replacing it. Server rendering produces the same order without browser APIs.

Nested Collections are independent: an inner Collection's items don't appear in the outer one.

## Accessibility

Collection adds no attributes, roles, selection or keyboard behavior. Give the container and items the semantics your use needs, such as a list.
