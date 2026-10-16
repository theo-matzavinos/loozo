# Utilities

`@loozo/origami-ui/utils` exports the two helpers the primitives use:

[src/utils/field-hint.ts](../snippets/src/utils/field-hint.ts "both")

- `injectUniqueId(key)` returns an opaque ID that's stable for this allocation and unique within the application. Call it once per mounted identity, in an injection context, and keep the result. Its spelling and allocation order aren't part of the API.
- `injectDeferred(token)` captures the current injector in an injection context and returns a function that resolves `token` from it later, outside the injection context. Nothing is resolved at capture time.

Both throw when called outside an injection context.
