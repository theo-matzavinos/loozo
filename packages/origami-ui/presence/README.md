# Presence

Presence tracks an enter/exit lifecycle for its host, so you can keep content rendered until its exit animation finishes. It doesn't hide, move or remove the host; you decide what to render from its State.

[src/presence/notice.ts](../snippets/src/presence/notice.ts)

## Replacing Options

Drive Presence from application state instead of its own `present` model:

[src/presence/offline-banner.ts](../snippets/src/presence/offline-banner.ts)

## State and attributes

```text
present becomes true  → opening → open
present becomes false → closing → closed
```

`OrigamiPresenceState` has `phase()`, one of `opening`, `open`, `closing` and `closed`, and `open()`, which is true in every phase except `closed`. Gate children on `open()` to keep them through the exit.

| Host attribute  | Present during |
| --------------- | -------------- |
| `data-entering` | `opening`      |
| `data-present`  | `open`         |
| `data-leaving`  | `closing`      |

Each attribute is empty when present and absent otherwise. They're owned by Presence; don't author them yourself.

Presence adds no ARIA and doesn't hide, detach or remove its host. Presence itself does not hide retained content from assistive technology; you own its accessibility during exit.

`opening` and `closing` settle when the finite animations on the host itself finish or are cancelled. Presence looks for them after the transition's attribute, the host's bindings and the newly rendered children have taken effect, so an animation your CSS starts from `data-entering` or `data-leaving` is found. Infinite animations are ignored, even alongside finite ones, and no animation or a zero duration settles straight away, without a timer. Reversing mid-transition, or destroying the host, discards the earlier transition's pending completion. Reduced motion is up to your CSS: when your `prefers-reduced-motion` styles remove the animation, the transition settles without one.
