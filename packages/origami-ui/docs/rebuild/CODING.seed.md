# coding standards

> **Historical.** Seed-era document from the `origami-ui-rebuild` repository, kept as written. Its paths refer to that repository's layout, and its authority statements no longer apply. See [PROVENANCE.md](../../PROVENANCE.md) for where everything moved.

use these standards for code guidance, implementation, and review. language and framework sections apply only to relevant work.

## design

- good enough is better than perfect, but type safety, accessibility, user/developer experience, and performance are deliverables, not optional polish.
- identify a concrete consumer first, design the api around its usage and ux/dx, then implement. prove the design through that consumer and generalize only from demonstrated needs.
- prefer primitives over abstractions and a little duplication over premature abstraction; copy/paste is fine when the shared concept isn't yet clear.
- don't create needless symbols, one-use wrappers, or one-line helpers without a real readability benefit.
- prefer the strategy pattern for concrete behavior variants when it clarifies ownership and avoids scattered branching. keep strategies small; don't add speculative extension points.
- prefer vertical feature slices over horizontal technical layers.

## correctness and tests

- validate input at real external or trust boundaries. don't add defensive fallbacks for invalid internal state; let it fail clearly. don't complicate the common path for extremely unlikely, low-impact scenarios.
- test durable, externally observable contracts or demonstrated regression risks, not coverage targets. use stable public interfaces rather than implementation details.
- keep tests while their future feedback or regression protection justifies their maintenance cost. temporary development or diagnostic tests may be deleted.

## code style

- prefer straightforward code over clever code. choose names, control flow, and data transformations that reveal intent, rather than optimizing for brevity.
- don't compress control flow or data preparation to reduce line count. name distinct boolean concepts and bind awaited or effectful results and asserted or narrowed views before inspecting them.
- preserve evaluation order, conditional execution, and short-circuit safety when introducing intermediate values. keep trivial or homogeneous conditions inline, without an operator-count threshold; don't extract every ordinary property access or create needless wrappers.
- prefer well-structured `for` loops over chains of immutable collection methods such as `filter`, `map`, and `reduce`. this isn't a ban on individual method calls or permission to mutate caller-owned data.
- await independent async operations together with `Promise.all`. preserve sequencing for dependent results or side effects, and respect concurrency limits.
- use brackets, parentheses, semicolons, and other explicit syntax whenever the language supports them.
- avoid ternary expressions. prefer early returns for conditional control flow.
- use vertical whitespace to separate meaningful sections.

## typescript

- type assertions don't validate input.
- prefer resolving optional options or injected dependencies with destructured parameter defaults rather than repeated `options.foo ?? default` assignments. preserve intended evaluation timing for dynamic defaults; use a factory such as `now = () => new Date()` when each invocation needs a fresh value.

## angular

- avoid method-based lifecycle hooks when signal-based or function-based angular APIs express the required behavior.
- use inline templates in team-oriented angular code and examples. an article may separate a long template for readability; explain that presentation choice without reciting internal team conventions.
- omit `standalone: true`; standalone is the default.
- name angular symbols and files for their domain concept without angular role suffixes such as `Component`, `Directive`, or `Service`, or filename suffixes such as `.component`, `.directive`, or `.service`.
