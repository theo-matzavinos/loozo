# agent instructions

## breaking changes

these packages have no consumers and publish `0.0.x` versions, so there are no compatibility obligations.

- change any public API, contract or behavior when it improves the design. don't seek approval or flag a change as risky merely because it breaks.
- don't add deprecations, compatibility shims, aliases, fallbacks for old shapes or migration notes. update every in-repo caller, example, doc and spec in the same change.
- don't escalate the version for a break; the next `0.0.x` is fine. keep marking breaks with `!` in conventional commit subjects.
