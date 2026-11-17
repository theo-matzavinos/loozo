/**
 * Typed declarations, codecs and synchronous URLs for Angular's native router.
 *
 * @remarks
 * Install generated `routes` with Angular's provideRouter. Import a route's
 * `destination` from its colocated `destination.generated.ts` for URLs, links and
 * navigation, and `injectRoute` from its `route.generated.ts` for typed signals.
 * Generate through the application/serve Architect companions. The `_core` and
 * `_generated` subpaths are internal package/generator coupling, not supported
 * application metadata or graph APIs.
 *
 * @packageDocumentation
 */
export {
  defineRoute,
  createUrl,
  serverRoutePath,
  stringParam,
  numberParam,
  booleanParam,
  enumParam,
  withFallback,
  arrayParam,
} from "@loozo/angular-router/_core";
export type {
  Route,
  ParamCodec,
  Destination,
  ParamsOf,
  SearchOf,
  TargetOf,
} from "@loozo/angular-router/_core";
