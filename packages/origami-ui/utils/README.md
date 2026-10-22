# Utilities

`@loozo/origami-ui/utils` exports the three helpers the primitives use:

[src/utils/field-hint.ts](../snippets/src/utils/field-hint.ts "both")

- `injectUniqueId(key)` allocates an element ID, the default of an `id` input. Render it as that element's `id`: in the browser it first returns the element's rendered `id`, so a hydrating element keeps the ID the server rendered. Otherwise it allocates `og-<key>-s<n>` on the server or `og-<key>-<n>` in the browser, so IDs the browser allocates never collide with server-rendered ones. Call it once per element and keep the result.
- `injectUniqueValue(key)` allocates a value default, `og-<key>-<n>`, unique within the application. It's never rendered. Values are application-local: the server and the browser allocate them independently, so a value isn't guaranteed to match across hydration. Give explicit values to anything that must survive hydration or be stored.
- `injectDeferred(token)` captures the current injector in an injection context and returns a function that resolves `token` from it later, outside the injection context. Nothing is resolved at capture time.

Keys match `/^[a-z][a-z0-9-]*$/`; anything else throws a `TypeError`. All three throw when called outside an injection context.

The entry point also exports `ɵOrigamiDescribedBy`, the package-private owner of an element's `aria-describedby` that Origami's Tooltip Trigger and Field controls share, and `ɵOrigamiLayer` and `ɵOrigamiPresentationScope` with their contract types, the package-private Escape and outside-pointer dismissal and presentation nesting that Popover and Tooltip share. None of them is an application API.

While none of them names an ID, the element keeps your static `aria-describedby`. A hydrated element already carries the server's IDs, so once the IDs Origami names equal exactly that value, it counts as the server's output, not yours: once the last ID goes, the attribute is removed instead of falling back to it. Hydration may first name only some of those IDs, such as a Field Error's before the ID of Tooltip Content in a child component; the value stays until they all are. Two edges follow:

- A static `aria-describedby` equal to exactly the IDs Origami names at any time is treated as absent. Don't repeat Origami's IDs in it.
- If the describers change while the control is still dehydrated in a separate `@defer` boundary, the server's IDs stay as the static value. Keep associated parts inside one boundary, as the [package README](../README.md) already advises.
