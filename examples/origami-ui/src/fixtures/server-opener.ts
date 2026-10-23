import { Component } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  injectOrigamiDialogOpener,
} from "@loozo/origami-ui/dialog";

// SSR-only dialog opener consumer rendered by tests/acceptance/ssr-checks.mjs; never routed.

/** Never mounted: `open()` throws on the server before creating anything. */
@Component({
  selector: "server-opened-dialog",
  imports: [OrigamiDialogContent],
  hostDirectives: [OrigamiDialog],
  template: `<dialog ogDialogContent>Opened from code</dialog>`,
})
export class ServerOpenedDialog {}

/** Y21: calls `open()` during the server render and renders what it threw. */
@Component({
  selector: "server-opener-app",
  template: `<output data-testid="server-opener-error">{{ error }}</output>`,
})
export class ServerOpenerConsumer {
  readonly error: string = "none";
  readonly #opener = injectOrigamiDialogOpener(ServerOpenedDialog);

  constructor() {
    try {
      this.#opener.open();
    } catch (error) {
      if (error instanceof Error) {
        this.error = error.message;
      }
    }
  }
}
