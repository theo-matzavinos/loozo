# Popover design map

Ownership and read timing for Popover and the two package-private pieces `PopoverContext` composes: the floating presentation (`ɵOrigamiFloating`) and the dismissal layer (`ɵOrigamiLayer`, `ɵOrigamiLayers`). Usage is in the [README](README.md); the contract is SPEC section 10 and [SPEC-POPOVER.md](../SPEC-POPOVER.md). The pieces' machines run in effects, render hooks and events, never in a part's host bindings, and aren't mapped here.

## Popover

### Ownership

| Fact                                        | Owner                                                                                                                                      | Readers                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open intent, disabled, dismissible          | root `OrigamiPopoverOptions`, through `PopoverContext`                                                                                     | every part (an ancestor read); the floating host (`intent`); the layer host (`intent`, `revision`, `dismissible`)                                                                                                                                 |
| Trigger ID                                  | `OrigamiPopoverTriggerOptions`                                                                                                             | the Trigger; an Anchor on the same element through the Trigger slot                                                                                                                                                                               |
| Trigger disabled, focusable when disabled   | `OrigamiPopoverTriggerOptions`, combined with the root's disabled                                                                          | the Trigger's activation guard; the Button Options it supplies to its composed `ogButton`, which owns the disabled attributes, and through them a Toolbar control on the same element; focus restoration through the Trigger slot (disabled only) |
| Anchor ID                                   | `OrigamiPopoverAnchorOptions`                                                                                                              | the Anchor, unless it shares the Trigger's element                                                                                                                                                                                                |
| Content ID, side, align, gap                | `OrigamiPopoverContentOptions`                                                                                                             | Content; the Trigger's `aria-controls` and the floating piece's positioning through the Content slot                                                                                                                                              |
| One Trigger, Anchor and Content             | `PopoverContext` slots, set by each part's registration in `ngOnInit`; a second registration throws                                        | `parts`, `contentId`, `anchorId`; the floating host's `parts` (Anchor as reference; complete only with all three)                                                                                                                                 |
| Participation                               | `PopoverContext`'s `ɵOrigamiFloating`                                                                                                      | Trigger `aria-expanded`, Content `inert`, the layer                                                                                                                                                                                               |
| Nesting                                     | the parent `PopoverContext`, by DI `skipSelf`, which supplies both the floating parent (its `floating`) and the layer parent (its `layer`) | the floating piece (presentation); the layer (branch, coverage)                                                                                                                                                                                   |
| Focus restoration                           | `PopoverContext`: `restoreFocus`, reached through the layer host's `restoreFocus` and the floating host's `closed` hook                    | Escape and Trigger dismissal; script close                                                                                                                                                                                                        |
| Document-level dismissal and stacking order | `ɵOrigamiLayers`, an application `@Service`, through `PopoverContext`'s `ɵOrigamiLayer`                                                    | every Popover's layer; the floating piece, through its host's `nextOrder`                                                                                                                                                                         |

### Read timing

| Read                                    | Reader                                                                                      | Phase                | Platform                         | If the owner isn't initialized                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Registered Content `id()`               | Trigger `[attr.aria-controls]`                                                              | render               | both                             | Content in a child component isn't registered yet: no attribute, filled in when it registers. Server HTML is complete. |
| Registered Trigger `id()`               | an Anchor on the Trigger's element                                                          | render               | both                             | Both parts register in the same element's `ngOnInit`, before its host bindings.                                        |
| Root Options, participation             | Trigger and Content host bindings                                                           | render               | both                             | Safe: an ancestor's, or the Context's own.                                                                             |
| Own Trigger Options, root disabled      | the composed Button's host bindings, through the Trigger's Button Options, and `activate()` | render, event        | both; event in browser           | Safe: its own and an ancestor's.                                                                                       |
| Registered Trigger Options disabled     | focus restoration                                                                           | event, effect        | browser                          | Safe: no restoration without a registered Trigger.                                                                     |
| Registered Content Options for position | the floating piece's `effect` and `afterEveryRender`                                        | effect, after render | browser (the server stops early) | Safe.                                                                                                                  |

## Floating presentation (`ɵOrigamiFloating`)

One per Popover root, constructed by `PopoverContext` in its injection context and destroyed last in its teardown. Native manual show/hide of one Content host, preparation, Floating UI positioning and tracking, Presence reveal coordination and the presentation tree.

### Ownership

| Fact                                    | Owner                                                                                   | Readers                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Requested intent                        | the owner, as the host's `intent`, a new object per effective decision                  | synchronization, attempts, position snapshots, `participating`                        |
| Parts: reference, Content, completeness | the owner's slots, as the host's `parts`, compared by identity                          | attempts, activation ownership, positioning                                           |
| Position configuration                  | the registered Content's Options (`id`, `side`, `align`, `gap`), validated when read    | attempts, the position READ                                                           |
| Presentation parent and children        | the owner names the parent at construction; the parent keeps its children               | gating, suppression, retained exit, `participating`, the post-reveal position request |
| Native activation and its order         | the piece; the order comes from the host's `nextOrder` at the participation grant       | the owner's layer (Escape order, branch snapshot), tracking, the READ                 |
| Participation                           | the piece: shown and accepted, intent open, every presentation ancestor requested       | the owner's host bindings, its layer                                                  |
| Readiness and presentation epoch        | the piece                                                                               | presentation children, the owner's layer snapshot and close epoch                     |
| Interaction close                       | the piece, set by `closeFromInteraction` and cleared at the next observed intent change | the host's `closed` hook                                                              |
| Last attempt (failure and cancel latch) | the piece                                                                               | the WRITE that decides whether to activate                                            |
| Preparation overrides                   | `FloatingPreparation`, owned by the piece                                               | WRITE                                                                                 |
| Tracking subscription                   | the piece's `autoUpdate` cleanup                                                        | READ, hide, release                                                                   |
| Entering permit and reveal              | `ɵOrigamiPresencePresentation` on the Content host                                      | Presence (see [presence/DESIGN.md](../presence/DESIGN.md))                            |

### Read timing

| Read                                          | Reader                                         | Phase                       | Platform                                  | If the owner isn't initialized                                   |
| --------------------------------------------- | ---------------------------------------------- | --------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Host `intent`, `parts`                        | the `effect`, WRITE, READ, event callers       | effect, after render, event | both; the server stops before native work | Safe: the owner's own signals; missing parts read as incomplete. |
| Registered Content Options                    | `#configuration` in the `effect` and READ      | effect, after render        | browser (the server stops early)          | Safe: Content is registered, so its inputs are set.              |
| Reference computed writing mode and direction | `earlyRead`, READ                              | after render                | browser                                   | Safe.                                                            |
| Parent readiness, intent, epoch               | the `effect`, `#canPresent`, attempts          | effect, after render, event | browser                                   | Safe: the parent is constructed first.                           |
| Content Presence phase and transition         | the `effect`, WRITE, READ                      | effect, after render        | browser                                   | Safe: same element as the registered Content.                    |
| `:popover-open`, `isConnected`                | WRITE, READ, `isParticipating`, `nativeToggle` | after render, event         | browser                                   | Safe: live.                                                      |

### Refresh dependencies

- A position result requests a render (`schedule`); its WRITE commits coordinates and the reveal, and Presence's READ in that render discovers the entrance.
- A child activates in the render after its parent's reveal commit, which changes the parent's readiness signal its `effect` tracks.

## Dismissal layer (`ɵOrigamiLayer`, `ɵOrigamiLayers`)

`ɵOrigamiLayer` is one per Popover root, constructed by `PopoverContext` after its floating piece and destroyed first in its teardown. `ɵOrigamiLayers` is the application `@Service` with the document listeners: Escape, the outside-pointer gesture, the order counter, veto preflight and descendant-first dismissal.

### Ownership

| Fact                                               | Owner                                                                                                               | Readers                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Registered layers                                  | `ɵOrigamiLayers`, written at a layer's construction and destruction                                                 | the Escape topmost search, gesture candidates                                                   |
| Stacking order counter                             | `ɵOrigamiLayers`                                                                                                    | the floating piece, through its host's `nextOrder` and the layer's `nextOrder`                  |
| Branch parent                                      | the owner, at construction: the parent Popover's layer                                                              | the coverage walk                                                                               |
| Branch children                                    | the parent layer: an immutable `Set` replaced on add and remove, captured by identity                               | branch capture and freshness, `containsPath`, `containsFocus`, `branchOrder`                    |
| Owner revision                                     | the owner, as the host's `revision` (Popover: parts and policy, one object whose identity changes when either does) | branch freshness                                                                                |
| Dismissible                                        | the owner, as the host's `dismissible`                                                                              | the veto preflight, captured in the snapshot                                                    |
| Own-part containment, Content focus                | the owner, as the host's `containsTarget` and `containsFocus`                                                       | `containsPath` (the outside gesture), `containsFocus` (the floating host's `closed` hook)       |
| Participation, order, activation, epoch, readiness | the owner's floating piece                                                                                          | Escape, the gesture, branch snapshot, close epoch                                               |
| Interaction close, focus restoration               | the owner, as the host's `closeFromInteraction` and `restoreFocus`                                                  | `ɵOrigamiLayers.dismiss`, descendants before ancestor                                           |
| Dismissal document                                 | `ɵOrigamiLayers`: the application `DOCUMENT`, exposed on each layer as `document`                                   | the document listeners, `dismiss`; the owner's `closed` hook and restoration, through its layer |
| Acquired gesture                                   | `ɵOrigamiLayers`, from a trusted primary `pointerdown` until its `pointerup` task, cancel or drag                   | the `pointerup` task                                                                            |

### Read timing

| Read                                                                            | Reader                                                                  | Phase               | Platform                     | If the owner isn't initialized           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- | ---------------------------- | ---------------------------------------- |
| Floating `isParticipating()`, `order()`                                         | Escape, `pointerdown`, the `pointerup` task                             | event, task         | browser                      | Not activated: not a candidate.          |
| Host `intent`, `revision`, `dismissible`; floating activation, epoch, readiness | `captureBranch`, `matches`, `dismiss`                                   | event, task         | browser                      | Safe: captured and compared by identity. |
| Host `containsTarget`                                                           | `containsPath`                                                          | event, task         | browser                      | Missing parts contain nothing.           |
| Host `containsFocus`                                                            | `containsFocus`, from the floating host's `closed` hook                 | effect, event       | both                         | No Content: contains nothing.            |
| The dismissal document's `activeElement`                                        | `dismiss`; the owner's `closed` hook and restoration, through its layer | effect, event, task | both; restoration in browser | Safe: live.                              |

No render-time reads and no self-correction.
