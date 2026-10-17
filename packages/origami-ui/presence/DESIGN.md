# Presence design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 7.

## Ownership

| Fact                        | Owner                                                                                                                                          | Readers                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Desired presence            | the effective `OrigamiPresenceOptions` on the same element                                                                                     | the current transition                                                       |
| Current transition          | `PresenceContext`, a `linkedSignal` over desired presence; each new transition is a new object, kept when it settles                           | `phase`, discovery, completion, Popover's position snapshots and reveal gate |
| Settled                     | `PresenceContext`, a `linkedSignal`: always true on the server (SSR settles); on the client reset by each new transition and set by completion | `phase`, discovery                                                           |
| Phase                       | derived from the transition's direction and whether it has settled                                                                             | the host markers, State                                                      |
| Pending discovery and waits | the transition object they captured; work belongs to the current transition only while it's the same object and Popover's lifetime unchanged   | `#isCurrent`, which also drops work after destruction                        |
| Initial phase on the client | the server's `data-present` attribute on the reused host, read at construction                                                                 | the first settled computation                                                |
| Entering permit and reveal  | `ɵOrigamiPresencePresentation` (Popover) on the same element, keyed by transition object; its native lifetime is a Popover generation          | `entering`, discovery                                                        |
| Animations                  | the host's CSS                                                                                                                                 | discovery (`getAnimations()`)                                                |

## Read timing

| Read                                   | Reader                                 | Phase                   | Platform | If the owner isn't initialized                                                                                                                                                        |
| -------------------------------------- | -------------------------------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-present` attribute               | constructor field                      | construction            | both     | On hydration the reused server element carries it; on a client-only render it's absent. The markers are reserved, not consumer-authored.                                              |
| Own Options `present()`                | the current transition                 | render                  | both     | Safe: own element, inputs set before its host bindings.                                                                                                                               |
| Popover's entering permit              | `entering`, for `[attr.data-entering]` | render                  | browser  | No permit yet: no `data-entering`, and Presence stays `opening`. Popover permits it after its coordinates resolve and schedules the render that applies it (SPEC-POPOVER.md).         |
| Popover's reveal commit                | discovery                              | after render            | browser  | Not committed: discovery waits for a later render's READ.                                                                                                                             |
| Popover's `visual()`                   | discovery                              | after render            | browser  | No revealed native host while `closing` (closed before reveal, suppressed or hidden): completion settles `closed` in the same READ, without waiting for `data-leaving` or animations. |
| Popover's `captureLifetime()`          | discovery WRITE, `#isCurrent`          | after render, microtask | browser  | `0` without Popover. Popover's `reset()` advances it while the transition object stays the same, so a released native activation's waits stop counting as current.                    |
| Current transition                     | Popover `captureTransition`            | after render, event     | browser  | Safe: a signal read. After destruction it returns an object no pending work holds.                                                                                                    |
| `getAnimations()`, `hasAttribute(...)` | `afterEveryRender` read                | after render            | browser  | Runs after every owner's WRITE in the same render.                                                                                                                                    |

## Refresh dependencies

- Settling only writes the settled signal, from the READ or an animation-completion microtask. Applying it, by removing `data-entering` or `data-leaving`, setting `data-present` and releasing children gated by `state.open()`, takes the render Angular schedules for that signal write. This holds for direct and composed Presence.
- A Popover-composed entrance also depends on the render Popover schedules after permitting entry: it applies `data-entering`, and the following READ discovers the entrance.
