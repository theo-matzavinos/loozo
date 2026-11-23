# Remembered search values are stored under an authored id

`remembered(codec, id)` takes a hand-written id, and that id alone names the stored value: the same id is the same value wherever it's used, and ids are only checked for uniqueness within one route's effective search. Stored values outlive deployments, so their name must survive file moves, renamed route directories, translated URL segments and path changes that a derived name would follow; an authored id changes only when the developer decides the old values no longer apply (`"orders.pageSize.v2"`), and two unrelated lists can share a value on purpose.

## Considered options

- **The URL or path of the owner**: changes with translated segments, param values and path edits, orphaning every stored value.
- **The generator's declaration id (the owner's source path) plus the key**: no string to write, but it moves with files, so a refactor silently resets or misattributes users' values.
- **An authored id checked for uniqueness across the whole app**: generation can't evaluate codec calls, so the check would be a runtime registry that sees only loaded route tables, giving false confidence for a global rule.

## Consequences

An accidental collision between unrelated subtrees shares one value; the README tells developers to prefix ids with their page.
