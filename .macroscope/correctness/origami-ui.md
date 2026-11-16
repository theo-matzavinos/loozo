---
include:
  - "packages/origami-ui/**"
---

These instructions restate the Origami rules in `AGENTS.md` at the repository root.

## Out-of-scope composition

Consumers use an Origami directive either directly in their template or through `hostDirectives`. Do not report:

- a consumer directive whose selector co-matches a primitive's on the same element, or the import-order provider precedence that would follow from it
- two button primitives co-applied to one element, or `ogButton` co-applied next to a button primitive (a directive that composes `ogButton`); Angular shares one `ogButton` between them, and this is unsupported by design

Other Origami directives co-applied to one element are in scope.

## Out-of-scope environments

Do not report web-component or shadow-DOM edge cases (closed shadow roots, slotted content in a shadow-root host, `delegatesFocus`), nodes from another realm such as an iframe, or DOM named-access quirks such as forms or controls named after DOM properties (`<form name="body">`, `<input name="parentNode">`).
