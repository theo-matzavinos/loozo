# agent instructions

## breaking changes

these packages have no consumers and publish `0.0.x` versions, so there are no compatibility obligations.

- change any public API, contract or behavior when it improves the design. don't seek approval or flag a change as risky merely because it breaks. the design itself still needs loozo's approval before implementation, like any interface change.
- don't add deprecations, compatibility shims, aliases, fallbacks for old shapes or migration notes. update every in-repo caller, example, doc and spec in the same change.
- don't escalate the version for a break; the next `0.0.x` is fine. keep marking breaks with `!` in conventional commit subjects.

## origami composition

consumers use an origami directive either directly in their template or through `hostDirectives`. don't design, test or guard for a consumer directive whose selector co-matches a primitive's on the same element, or for the import-order provider precedence that would follow from it.

two origami directives co-applied to one element in a template stay in scope, except `ogButton` next to a button primitive (a directive that composes `ogButton`), or two button primitives: that's unsupported: angular shares one `ogButton` between them and only one part's options reach it. a control that needs two of them is a toolbar variant, such as `ogToolbarToggle` or `ogToolbarPopoverTrigger`. don't design, test or guard for co-applied button primitives.

## origami verification

the full browser matrix takes about 40 minutes, so match the run to the moment:

- while iterating, in fix rounds and for mutation checks: `pnpm test` plus the changed primitive's cases, selected by their `acceptance/CASES.md` letter across every spec (`pnpm run test:focus -g '\bN\d+\b'` for tooltip). add the letters of every primitive that composes it: popover's floating, layer and intent pieces add tooltip, presence adds collapsible, accordion, popover and tooltip, the roving core adds tabs, toggle group, toolbar and radio group, `ogButton` adds every button part, and `/utils` adds everything. run them in the other two engines too when focus, pointer or geometry behavior changed (`ORIGAMI_MATRIX_TARGET=development-eager ORIGAMI_BROWSER=<engine> pnpm run acceptance:test -g …`), and under `development-incremental` when hydration behavior changed.
- at sign-off, before the commit: `test:commit` once, after the reviews are clean, never once per review round.
- before a release: the full `test:full`.

don't run a gate while reviewers or implementers are using the same machine; the contention flakes timing-sensitive cases.

## readmes

each readme documents only its own scope:

- `README.md` (repo root): the monorepo as a whole.
- `packages/angular-router/README.md` and `packages/angular-launch/README.md`: their library.
- `packages/origami-ui/README.md`: origami as a whole.
- `packages/origami-ui/<primitive>/README.md`: that primitive.

put content in the readme that owns it and link to it from a parent readme instead of repeating it.

`packages/origami-ui/<primitive>/DESIGN.md` holds that primitive's design map, as `packages/origami-ui/SPEC.md` "Adding a primitive" describes: ownership and read timing only. Usage belongs in the readme and the contract in the spec. Update the map in the same change whenever ownership or read timing changes.
