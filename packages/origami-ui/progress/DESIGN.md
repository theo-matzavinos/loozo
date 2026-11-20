# Progress design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 34.

## Ownership

| Fact                            | Owner                                                                                                                                   | Readers                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Options (value, max, valueText) | the root directive through `OrigamiProgressOptions` (`provideExisting`), or a composer's whole replacement                              | the Context (deferred with `injectDeferred`)                                          |
| Minimum                         | constant 0                                                                                                                              | the root's static `aria-valuemin`; the Context's clamp                                |
| Effective max                   | the Context: Options `max` when finite and > 0, else null                                                                               | `aria-valuemax`; value, percent, complete                                             |
| Rendered value                  | the Context: null when Options `value` is null or non-finite or max is null, else clamped to [0, max]                                   | `aria-valuenow`; percent; complete; default text; State `value`; `data-indeterminate` |
| Fraction / percent              | the Context: value ÷ max × 100, null with the value                                                                                     | `--og-progress-percent`; State `percent`                                              |
| Indeterminate                   | derived: rendered value is null                                                                                                         | `data-indeterminate`; absence of `aria-valuenow`, the property and the default text   |
| Complete                        | the Context: value === max                                                                                                              | `data-complete`; State `complete`                                                     |
| Value text                      | the Context: Options `valueText`, else the Intl percent of the fraction, else null                                                      | `aria-valuetext`; State `valueText`                                                   |
| Locale                          | `LOCALE_ID` from the root element's injector (the application's, or a component's override), injected once in the Context's constructor | the default formatter, created on first use                                           |
| Accessible name                 | the consumer: static, bound or composer-host `aria-label` / `aria-labelledby`                                                           | the browser; Origami never reads or writes it                                         |

## Read timing

| Read         | Reader                                                            | Phase        | Platform | If the owner isn't initialized                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------- | ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Options | the Context's `computed`s, through the root's host bindings       | render       | both     | Deferred: first resolved in the root's host-binding pass, after construction and input setting, so own inputs hold their bound values; a replacement's signals hold whatever they hold then and must be complete. |
| `LOCALE_ID`  | the Context's constructor                                         | construction | both     | Always provided (Angular defaults it to `en-US`); the nearest injector of the root's element, so a subtree may override it.                                                                                       |
| State        | descendants, a composer's template, a `#p="ogProgress"` reference | render       | both     | An ancestor's or host's State: the root is constructed and its inputs are set before any descendant or the composer's own view renders.                                                                           |

## Refresh dependencies

- None for the first render: every bound fact is computed synchronously from Options and `LOCALE_ID` in the root's host-binding pass, so the first change detection, on the server too, renders the complete bar. Server HTML needs no second pass.
- After that, each write to a value, max or valueText signal (an input, a replacement signal, a signal written from a timer) marks the view that declares the root's element for refresh, and Angular's scheduler refreshes it. Two inputs bound in one template change together in one pass, before the host bindings read them. Within that pass Angular writes each attribute separately; the in-bounds invariant holds per settled pass.
- Incremental hydration: a root in a still-dehydrated `@defer` block keeps the server's attributes until the block hydrates, whatever its inputs' sources do meanwhile; it renders the current values in the hydrating change detection.
