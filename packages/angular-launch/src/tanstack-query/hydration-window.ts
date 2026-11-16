import { InjectionToken } from "@angular/core";

/**
 * Whether the app is still hydrating: open in the browser from bootstrap until the app is
 * first stable, never open on the server.
 *
 * @remarks
 * Internal; provided by `provideLaunchQueries()` and read by route query options.
 */
export const hydrationWindow = new InjectionToken<{ open: boolean }>("Launch hydration window");
