# Launch holds a call until the work its middleware started has ended

`@loozo/angular-launch` hands a host's `waitUntil` (`HandleOptions.waitUntil`, which Cloudflare Workers fill with `ctx.waitUntil`) one promise per call that resolves only once the call's reply and every `next()` continuation its middleware started have settled, and it returns a stream or channel iterable that arrives after the call already replied. A middleware that answers without waiting for the rest of the call, such as a timeout that throws while the handler still runs, would otherwise leave that handler's `finally` to a host that may cancel it once the client leaves: on workerd under `wrangler dev`, such cleanup never ran. Holding the continuations makes cleanup on workerd behave as on Node and Deno, at the cost of keeping a Worker alive, up to Cloudflare's 30 s, for work whose reply already went out.

## Considered options

- **Hand over only the reply's promise**: no per-call state, but a timeout-style middleware's handler loses its cleanup on workerd, and the docs would have to list which middleware shapes are affected.

## Consequences

The settled promise can outlast the response, by as long as the slowest continuation (capped by the host). A continuation that never settles holds the request until the host's cap. A `next()` a middleware schedules after its call ended isn't tracked.

Evidence: plan-4.md, prototype-1.md, prototype-2.md and design-review-1/2/3 in the waitUntil work evidence (2026-11-27T08-35-27-419Z…9c9f88e0).
