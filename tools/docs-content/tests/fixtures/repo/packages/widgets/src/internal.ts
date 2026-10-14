export { Toggle } from "./index.js";

/** Coupling between generated code and the widgets runtime. */
export interface InternalHandle {
  /** Opaque id. */
  readonly id: string;
}

export function internalHelper(): void {}
