export { Toggle } from "./index.js";

/** Coupling between generated code and the widgets runtime. */
export interface InternalHandle {
  /** Opaque id. */
  readonly id: string;
}

export function internalHelper(): void {}

/**
 * A seam for another package, not for applications.
 *
 * @internal
 */
export interface SeamSpec {
  readonly name: string;
}

/**
 * Type-only key of the handle; its slug matches InternalHandle's.
 *
 * @internal
 */
export declare const internalHandle: unique symbol;
