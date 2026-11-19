import { InjectionToken, inject } from "@angular/core";
import type { RovingScope } from "@ui-sdk/core/renderer";

/**
 * What a Toolbar, or a ToolbarGroup inside one, gives the controls inside it that join its arrow
 * keys and tab stop but live in other entry points, like Toggle and ToggleGroup. A token, not the
 * Toolbar's class, so a toggle doesn't bundle the toolbar. Not public API.
 */
export type ɵUiSdkToolbarScope = {
  /** Whether the ToolbarGroup around the control is disabled. Reads a signal: call it tracked. */
  groupDisabled(): boolean;
  /** The toolbar's roving scope for a control in a group that is, or isn't, disabled. */
  scopeIn(groupDisabled: boolean): RovingScope;
};

/** Provided by UiToolbar, and again by UiToolbarGroup with its own `groupDisabled`. */
export const ɵUI_SDK_TOOLBAR = new InjectionToken<ɵUiSdkToolbarScope>("ui-sdk toolbar");

/**
 * A reader of core's internal `toolbar` option for a control inside a Toolbar, or `undefined`
 * outside one. Call the reader from the root's options, so they follow the group's `disabled`.
 */
export function ɵinjectToolbarScope(): () => (() => RovingScope) | undefined {
  const toolbar = inject(ɵUI_SDK_TOOLBAR, { optional: true });

  return () => {
    if (toolbar === null) {
      return undefined;
    }

    const groupDisabled = toolbar.groupDisabled();

    return () => toolbar.scopeIn(groupDisabled);
  };
}
