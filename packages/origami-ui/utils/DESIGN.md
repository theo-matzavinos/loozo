# Utilities design map

Ownership and read timing for `injectUniqueId`, `injectUniqueValue` and `injectDeferred`. Usage is in the [README](README.md); the contract is SPEC section 5.

## Ownership

| Fact                                        | Owner                                                                    | Readers                               |
| ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| The next number per key                     | `IdCounter` (`id-counter.ts`), one application `@Service`                | `injectUniqueId`, `injectUniqueValue` |
| Server or browser namespace (`s` prefix)    | `IdCounter.server`, from `PLATFORM_ID`                                   | `injectUniqueId`                      |
| A hydrated element's ID                     | the host element's rendered `id` attribute, written by the server render | `injectUniqueId` in the browser       |
| Key validity                                | `assertKey` (`id-counter.ts`)                                            | both allocators, before allocating    |
| The injector a deferred token resolves from | the function `injectDeferred` returns, which captures it                 | whoever calls that function           |

## Read timing

| Read                      | Reader                                       | Phase                                | Platform | If the owner isn't initialized                                                                                                  |
| ------------------------- | -------------------------------------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `host.getAttribute("id")` | `injectUniqueId`, as an `id` input's default | construction                         | browser  | A client-created host has no rendered `id` yet: the counter allocates `og-<key>-<n>`. A hydrating host returns the server's ID. |
| `IdCounter.next(key)`     | both allocators                              | construction (any injection context) | both     | n/a: the counter is the owner.                                                                                                  |
| The deferred token        | the function `injectDeferred` returns        | when called                          | both     | Callers call it at render time only for their own Options or an ancestor's (SPEC section 3, rule 1).                            |

No render-time reads and no self-correction.
