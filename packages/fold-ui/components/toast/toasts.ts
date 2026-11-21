import { Service } from "@angular/core";
import { OrigamiToaster } from "@loozo/origami-ui/toast";

/** What a toast shows. The title states the outcome; the kind only picks the icon. */
export interface ToastData {
  title: string;
  description?: string;
  kind?: "success" | "info" | "warning" | "error";
  /** A button that runs `run()`, then closes the toast. */
  action?: { label: string; run: () => void };
}

/**
 * The app's toasts: `add(data, { duration })` returns the toast's id, `close(id)` closes it.
 * Provided in root and shown by the one ToastRegion; don't provide it again.
 */
@Service()
export class Toasts extends OrigamiToaster<ToastData> {}
