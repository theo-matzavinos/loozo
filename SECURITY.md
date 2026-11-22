# Security policy

## Supported versions

Security fixes go into the latest published release of each package below. Earlier releases get no backports.

- `@loozo/angular-router`: the latest published release. The router runs at build time (route generation, the application and dev-server builders) and in the browser (generated route tables, links, navigation); report issues in either.
- `@loozo/angular-launch`: the latest published release. Launch accepts untrusted input over HTTP RPCs, event streams and websocket channels. Its threat model is in [`packages/angular-launch/SPEC.md` §Threat model](packages/angular-launch/SPEC.md#threat-model).

## Reporting a vulnerability

Report it privately through GitHub: open this repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue, pull request or discussion about it.

Include:

- the package and its version;
- the affected surface, such as an RPC, stream or channel, generation, a builder or the browser client;
- a minimal reproduction;
- the impact you expect.

## What happens next

One maintainer handles reports, on a best-effort basis. You'll get an acknowledgement within 7 days. A confirmed vulnerability is fixed in the next release of the affected package, followed by a GitHub security advisory that credits you, unless you'd rather not be named.

## Out of scope

What Launch's threat model assigns to the host or the application, such as request size, time and connection limits, authentication and authorization in stages, and the origins an application chooses to trust.
