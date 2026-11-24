# The token-aware query field is a new Origami primitive, not a Combobox mode or a fold-only component

fold's SearchBar needs a native single-line input whose text is a query of tokens, with suggestions for the token at the caret that edit the query in place. That behavior lives in a new public Origami primitive, `@loozo/origami-ui/query-field`: one input, a value-free suggestion listbox over Origami's package-private listbox core, the input-owned Popover, the stamped consumer analysis, the native-insertion pick and the input's invalid state and descriptions. fold's SearchBar composes it and adds only styling and the mark layer.

## Considered options

- **A Combobox mode**: the Combobox's choice commits a value and puts the option's whole label in the input, and closing without a choice writes the committed text back. A suggestion edits part of the text, and dismissing the list must never revert what was typed; bending the Combobox's committed-text and value policy to both would break its contract for its own consumers.
- **fold-only**: fold imports no `ɵ` symbols, so it can't reach the listbox core or the Popover input owner, and stock Popover presents only from a button Trigger. A fold component would re-implement the list's keyboard, active-descendant, dismissal and nesting behavior without Origami's three-engine and hydration qualification.

## Consequences

Origami's public surface grows by six directives, four Options tokens and a State; the primitive gets its own SPEC section (38, `[QF]`), acceptance cases (QF1–QF25) and bench workload. The listbox core and the Popover input owner gain a third and second user, still package-private. Consumers parse their own queries: Origami applies an analysis only to the text and caret it's stamped with, and never parses.

Evidence: research-1.md (§1 Combobox semantics, §2 fold's imports and Popover's Trigger), prototype-2.md (owner, Anchor and value-free listbox composition) and plan-3.md with plan-4.md in the fold-ui-searchbar work evidence; loozo's decisions of 2026-11-23 and 2026-11-24.
