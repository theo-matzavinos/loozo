# Origami UI — fresh-session rebuild handoff

> **Historical.** Seed-era document from the `origami-ui-rebuild` repository, kept as written. Its paths refer to that repository's layout, and its authority statements no longer apply. See [PROVENANCE.md](../../PROVENANCE.md) for where everything moved.

**Contract frozen; isolated seed setup and one seed commit authorized on 2026-10-11. No product implementation authority.**

This is the operational handoff for the agreed clean-room rebuild, not another product specification. The next explicitly authorized fresh main session owns the **whole library through bounded delegated slices**. The current authority covers only setup in `/home/loozo/Projects/origami-ui-rebuild`, branch `rebuild`, including genuine dependencies and one implementation-free seed commit. Do not begin product implementation from this handoff alone.

## Current agreement and remaining start gates

The scope is Collection, Presence, Collapsible, single/multiple Accordion, Popover and the two utilities. Preserve the public API and Options → private Context → readonly State architecture, including consumer `hostDirectives` and upper/lower Options substitution. Whole-public-surface meaningful TSDoc retained in packaged declarations is release-blocking.

On 2026-10-11, loozo approved the complete API/behavior and acceptance requirements by choosing **“Freeze and prepare the seed”**, after explicitly instructing us to ignore the Baseline audit. The formal audit is skipped, not passed; no widely-available certification is claimed. Three-engine/runtime qualification and ordinary-hidden degradation remain mandatory. No alternate presentation fallback is added.

The approved design keeps Content authored in place, uses basic native manual Popover for the top layer and private Floating UI for positioning, and preserves the specified dismissal, focus and Presence behavior. The opaque hydration-stable identity change and progressive `until-found` policy are agreed.

Before product execution:

1. **Verify the prepared seed.** Use only the new isolated repository, not a clone of the original repository/history. Confirm branch `rebuild`, its sole implementation-free seed commit, the full delivered seed SHA, supplied file/content inventory, genuine pinned dependency closure, readiness results and allowed write paths. The delivery receipt identifies the exact seed commit; compare it rather than assuming the current HEAD is the original seed.
2. **Obtain complete rebuild and endpoint authority.** Explicitly distinguish product working-tree edits and reviewed integration within the seed from product commits or external delivery. No product staging/commit, original-repository integration, push or publication is currently authorized. Leaving the full reviewed result uncommitted in this seed is the proposed endpoint, not present permission.
3. **Resolve consequential setup/dependency questions.** Check actual APIs and child readiness before dependent implementation. Empty package entrypoints and the setup smoke application contain no primitive behavior and cannot certify the public acceptance suite.

Do not treat seed preparation or its authorized commit as permission to write product code.

## Clean-room input packet

The authorized seed may contain only:

- `origami-ui.md`: complete frozen product contract.
- `origami-ui-popover.md`: approved detailed Popover design, reconciled with that freeze.
- `origami-ui-acceptance/`: the seven handwritten public consumer/type sources, `README.md` and `CASES.md`.
- This finalized handoff and applicable user/coding/workflow standards.
- Independently authored ordinary package/build/consumer setup, genuine pinned dependency metadata/lockfile, and authoritative public dependency documentation/source.

These names are relative to this handoff's current `specs/` directory. Preserve their links or update the packet's links explicitly when moving it. Record actual input file/content identities in the seed. The two product documents are frozen; the handwritten acceptance seeds remain unexecuted and require the specified later variants/proof.

**Exclude** archived Origami implementation, its tests/consumers/history, private earlier implementation attempts, patches, reference outputs and evaluator machinery. The contract's provenance citation is not permission to recover that source. Official dependency source is allowed evidence, not implementation instructions or permission to execute an acquired checkout. Code produced by the fresh main session and its owned implementers is allowed input thereafter.

The router rebuild handoff informed this workflow, not Origami's public API, dependencies, evaluator rules or authority. Do not copy router-specific generators, target counts, immutable evaluator conventions, runtime controls or permissions.

### What exists now

The eleven product-spec/acceptance inputs are handwritten preparation, not a passing evaluator. The authorized seed adds ordinary genuine dependency/APF/build/SSR setup, with empty library entrypoints and a separate smoke app. Acceptance covers public imports, composition, Options replacement, readonly/mode/provider types, utilities, identity, every primitive, documentation, native lifecycle and the required runtime matrix.

Preparation checks passed: scoped formatting/linting, TypeScript 6.0.3 syntax/transpile checks for seven files and genuine Angular compiler 22.1.5 parsing of six literal templates. Main review and fresh filesystem-read-only inspection found no blocking preparation contradictions. This is **not** import resolution, package typechecking, Angular AOT, SSR or browser qualification.

Ordinary build/SSR setup is included in the authorized seed. Case-specific variants, independently reviewed executable assertions, a thin black-box runner and real product evidence remain to be written under later rebuild authority. Missing variants are listed in the acceptance README; their definitions are not implemented coverage.

The selected setup uses Angular 22.1.5, TypeScript 6.0.3, Node 24.21.0 and pnpm 12.9.1 with genuine pinned dependencies. Angular framework source is at `468b65b74566537456c192ac4281795c5a1e1a5e`; matching CLI source is at `3954730dd23f665acfc3abdf595d20a7ede6a874`. Floating UI is `@floating-ui/dom@1.8.0`, researched source `dc62df23d72ad96d456c007d48d4541786fcd7eb`; verify the installed transitive closure from the seed lockfile. Do not treat dependency installation or setup smoke tests as product/runtime qualification.

## One fresh main session owns completion

The fresh main is the coordinator for the complete rebuild, not one slice or a one-shot experiment. It owns planning, setup readiness, delegation, actual-current-result review, findings disposition, reviewed integration, full qualification and the final handoff. Do not launch a new main session for each slice or substitute one sole implementer plus research helpers for bounded delegated implementation.

Use `planning-session` and `implement-review-loop` under their current contracts. Read `~/AGENTS.md` and `~/CODING.md`; give children the applicable standards when they cannot access them. Use normal supported parent-owned implementers and filesystem-read-only inspection for substantial dependency research or named concrete risks. Roles, tool success and reviewer agreement do not grant authority. Manual human code review remains on request; honor any explicit start-time architecture/result/precommit gates.

Start with a concrete consumer and a short overall consumer/data-flow/module/slice plan consistent with the approved design. Research consequential unresolved implementation questions, especially hydration-stable generated identity and actual Angular/native/geometry scheduling. Do not ask for redundant approval of the unchanged approved design; pause for material departures, new consequential risks, missing authority or requested review gates.

Retain each implementer for revisions and recovery. Before a child implementation prompt, establish genuine dependency readiness in that child's actual isolated environment. Do not share writable host dependencies, fabricate framework APIs/package-manager metadata, or add loader/PATH/compiler adapters to mask missing setup. A research-only inspector needs reading tools, not dependency installation.

Declare exact ownership and allowed paths per delegation. Dependent slices start from the reviewed current prerequisite result. Supported exact-HEAD clones exclude parent working-tree dirt: if product changes must remain uncommitted, explicitly transfer the reviewed prerequisite bytes/patch into the child, verify equality and retain the seed HEAD as the logical comparison base. Do not assume `spawn` inherited integrated dirt or invent commit authority to obtain a baseline. Check returned source/checkpoint identities before prompts.

Return uncommitted results for main review before any authorized integration or commit. Main reads the complete current source, public assertions and relevant dependency behavior, not just reports. Fix findings with the retained author, rerun affected verification, and renew affected requested approvals. Preserve results/evidence before disposing children. Stop and surface real blockers or material deviations rather than replacing authors, weakening proof or silently falling back. Continue through the complete authorized outcome, not merely the first passing slice.

## Ordered consumer-visible slices

The order expresses dependencies, not a requirement for four large indivisible tasks. Split further when a smaller public outcome improves ownership or review; avoid parallel dependent/overlapping writers. TSDoc and genuine consumer proof belong in **every** slice, not a documentation cleanup at the end.

### 1. Utilities, Presence and Collapsible

Deliver capture-time deferred injection, opaque mounted/hydration-stable identity, readonly Presence observation and the complete Collapsible composition/Options/association/hiding contracts. Keep Context private and registration/cleanup owner-scoped. Resolve aliased Options after construction, not while constructing their consumer.

Prove direct and consumer-host-composed usage, existing/factory providers, writable Options that are not model signals, finite/canceled/zero/infinite motion, reversal, destruction and write-before-discovery ordering. Use a focused real SSR/eager/deferred identity/Presence consumer early, including reverse sibling hydration, rather than postponing the identity design until the end.

The supplied full hydration unit imports Accordion and Popover too. Until those exist, author a bounded public consumer for this slice; do not insert fake exports or framework/library shims to make the full pack compile.

### 2. Collection and both Accordion modes

Deliver rendered DOM ordering, reactive item values, nearest-owner isolation and valid SSR observation. Compose Accordion through the completed lower primitives; substitute upper Options into lower Options without injecting the upper directive into private Context.

Prove single/multiple selection typing and behavior, unknown authoritative values, immutable caller arrays, combined disabled policy, mounted-only associations, cardinality/remount, generated values and exactly-once outputs. Include effective factory-signal/output reentry, not optimistic shadow state or parent-binding timing presented as synchronous proof. Preserve inherited Presence/identity contracts.

### 3. Popover through the approved native/positioning protocol

Deliver root/part registration, complete four-field Content Options, logical placement/fallback/update policy, logical branch ownership, atomic dismissal, focus restoration and actual native activation/Presence coordination. Keep Content and Angular views under their authored parent. No portal, clone, CSS anchors, `{ source }`, reflected `.popover` property, CDK Overlay, generic autofocus/Tab bridge or alternate inline rendering path.

Prove native activation separately from requested state, retention and paint readiness. Transparent preparation must preserve native autofocus and prevent unpositioned visible paint; reveal WRITE must precede entrance discovery. Visible exit discovery follows its own leaving/inertness WRITE, not a new geometry prerequisite. Position-request guards must not invalidate the sole animation completion. Reopening before native hide starts reuses promotion; reopening during hide reconciles through fresh activation after return. Native events observe actual current state and never write desired intent.

Challenge callback/owner reentry, style-override ownership, canceled-opening retry boundaries, native hide cleanup, topmost order, trusted pointer snapshots and nested suppression. Use an actual effective writable root Options variant and public State observations before callback return to certify synchronous native reentry. A parent-bound signal or focus counter alone is insufficient.

### 4. Whole-package and full runtime qualification

Finish all specified public variants and independent executable assertions. Build and consume all seven entrypoints, check complete public inventories/token identity, strict declaration and Angular AOT/template positives/negatives, and authored plus packaged TSDoc. No accidental public mutation or missing documentation may be deferred beyond completion.

Execute the applicable cases in Chromium, Firefox and WebKit × actual development/production runtime × eager/incremental hydration, with exact versions and normal/reduced-motion cases where relevant. Demonstrate raw real SSR, pre-bootstrap references, no transient child removal/duplication, retained generated identity/ARIA/values, genuine replay exactly once and live post-hydration bindings.

Use HMR-disabled development deferred proof (`--no-hmr`), keep real dependency code pending where needed and verify per-block attachment separately from a shared module fetch. Hydrate B before A with C still dehydrated; nested boundaries obey Angular's ancestor-first hydration. Production evidence must come from genuinely served production responses/runtime, not development optimization flags. Optional native `until-found` evidence stays distinct from mandatory ordinary hiding.

## Verification, independence and delivery

The frozen contract is normative. Acceptance sources may need bounded compilation corrections and additional variants/assertions, but preserve assertion independence and review changes against that contract. Do not weaken requirements, silently change meanings or edit tests merely to make a broken product pass. This is not a request to build a router-style evaluator platform.

Use real built-package imports and genuine dependencies. No private Context test calls, source-path aliases, guessed generated-ID spellings, fabricated SSR/hydration annotations, synthetic events presented as trusted input, fake geometry/native behavior or fixed sleeps presented as proof. Derive geometry expectations independently from settled DOM/logical edges with stated CSS-pixel tolerances, not a second call to the production positioning algorithm.

Before every mutating fixer/build/test/hook, check its full write target set and preserve unrelated work. Format then lint only intentionally affected supported authored files under the current workflow. Track generated-output ownership and review current results after verification. Read-only freshness checks must tie delivered bytes to reviewed and verified identities; tools and reports do not supply a repository lock.

A passing subset is feedback, not completion. Final completion requires the entire frozen public contract, every required executable case variant, meaningful packaged public TSDoc, the explicit skipped-audit/no-certification record and the full required runtime matrix. Report unsupported/unproven progressive enhancement coverage honestly; do not turn optional enhancement limits into waived mandatory behavior.

Deliver only to the explicitly named endpoint. Report current source/base identities, changed paths, verification commands/results, findings disposition and exact unresolved limits. Keep useful evidence and source recoverable; stop unnecessary servers. No product commit, source-repository integration, push or publication is inferred from finishing this handoff or the rebuild.

## Current next action

Finish authorized seed setup/readiness review and the single seed commit, then stop. Deliver the exact seed SHA and limitations. The later fresh main needs explicit authority to implement and review/integrate the entire frozen contract to a named endpoint. Leave the original repository's product files, unrelated router work and Git refs untouched; no product implementation is authorized now.
