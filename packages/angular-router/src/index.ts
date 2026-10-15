/**
 * Typed declarations, scalar codecs and synchronous URLs for Angular's native router.
 *
 * @remarks
 * Install generated `routes` with Angular's provideRouter and import the colocated
 * `injectRoute`/`destination` facade for typed signals, links and navigation.
 * Generate through the application/serve Architect companions. The `_core` and
 * `_generated` subpaths are internal package/generator coupling, not supported
 * application metadata or graph APIs.
 *
 * @packageDocumentation
 */
export {
  defineRoute,
  createUrl,
  stringParam,
  numberParam,
  booleanParam,
  enumParam,
  withFallback,
} from "@loozo/angular-router/_core";
export type { Route, ParamCodec } from "@loozo/angular-router/_core";
