# Utilities

`@loozo/origami-ui/utils` exports the three helpers the primitives use:

[src/utils/field-hint.ts](../snippets/src/utils/field-hint.ts "both")

- `injectUniqueId(key)` allocates an element ID, the default of an `id` input. Render it as that element's `id`: in the browser it first returns the element's rendered `id`, so a hydrating element keeps the ID the server rendered. Otherwise it allocates `og-<key>-s<n>` on the server or `og-<key>-<n>` in the browser, so IDs the browser allocates never collide with server-rendered ones. Call it once per element and keep the result.
- `injectUniqueValue(key)` allocates a value default, `og-<key>-<n>`, unique within the application. It's never rendered. Values are application-local: the server and the browser allocate them independently, so a value isn't guaranteed to match across hydration. Give explicit values to anything that must survive hydration or be stored.
- `injectDeferred(token)` captures the current injector in an injection context and returns a function that resolves `token` from it later, outside the injection context. Nothing is resolved at capture time.

Keys match `/^[a-z][a-z0-9-]*$/`; anything else throws a `TypeError`. All three throw when called outside an injection context.
