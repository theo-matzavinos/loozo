import { ErrorHandler } from "@angular/core";

declare const ngDevMode: object | boolean | undefined;

declare global {
  interface Window {
    /** Every error Angular handled, for the error cases of the browser suite. */
    __uiSdkErrors?: { name: string; message: string; devMode: boolean }[];
  }
}

/**
 * Records every error Angular handles in `window.__uiSdkErrors`, with whether dev mode was on,
 * then logs it as Angular's own handler does, so console output is unchanged.
 */
export class RecordingErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (typeof window !== "undefined") {
      const recorded = error instanceof Error ? error : new Error(String(error));

      (window.__uiSdkErrors ??= []).push({
        name: recorded.name,
        message: recorded.message,
        devMode: typeof ngDevMode !== "undefined" && !!ngDevMode,
      });
    }

    super.handleError(error);
  }
}
