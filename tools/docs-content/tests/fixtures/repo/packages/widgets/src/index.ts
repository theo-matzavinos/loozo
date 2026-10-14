import { Directive, input, model, output } from "@angular/core";

declare const brand: unique symbol;

/** Visual size of a toggle. */
export type ToggleSize = "small" | "large";

/** Label used when none is given. */
export const DEFAULT_LABEL = "Toggle";

/**
 * A two-state toggle.
 *
 * @remarks
 * Label it with {@link toggleLabel}; {@link Missing} is not a symbol.
 *
 * @example
 * ```html
 * <button fxToggle [(checked)]="on"></button>
 * ```
 */
@Directive({ selector: "[fxToggle]", exportAs: "fxToggle" })
export class Toggle {
  /** Whether the toggle is on. */
  readonly checked = model(false);
  /** Accessible label. */
  readonly label = input("", { alias: "fxToggleLabel" });
  /** Emits after a user change. */
  readonly changed = output<boolean>({ alias: "toggled" });
  readonly #flips = { count: 0 };
  declare readonly [brand]: true;

  /**
   * Flips the state.
   *
   * @returns The new state.
   */
  toggle(): boolean {
    this.#flips.count++;
    this.checked.set(!this.checked());

    return this.checked();
  }
}

/** Snapshot of a toggle. */
export interface ToggleState {
  /** Whether it is on. */
  readonly on: boolean;
  /** Optional label. */
  label?: string;
  /** Describes the state. */
  describe(): string;
}

/**
 * Formats a label for a {@link Toggle}.
 *
 * Second paragraph of the description.
 *
 * @param text - The visible text.
 * @param size - Optional size.
 * @returns The formatted label.
 * @throws RangeError when `text` is empty.
 * @deprecated Use `Toggle` labels directly.
 * @example
 * ```ts
 * toggleLabel("On");
 * ```
 */
export function toggleLabel(text: string, size?: ToggleSize): string {
  if (text === "") {
    throw new RangeError("Empty label");
  }

  return `${text} (${size ?? "small"})`;
}

/** Converts between toggle values. */
export function toggleValue(value: string): boolean;
export function toggleValue(value: boolean): string;
export function toggleValue(value: string | boolean): string | boolean {
  if (typeof value === "string") {
    return value === "on";
  }

  return String(value);
}

/**
 * Thrown by {@link Toggle | the `Toggle` directive}; {@link Missing | `Missing`} is not a symbol.
 */
export class ToggleError extends Error {
  /**
   * @param code - Machine-readable reason.
   * @param status - HTTP-like status.
   * @param secret - Not part of the API.
   */
  constructor(
    readonly code: string,
    public status: number,
    private readonly secret = "",
  ) {
    super(`${code}${secret}`);
  }
}

/** Created through `ToggleRegistry.create` only. */
export class ToggleRegistry {
  /** Number of registered toggles. */
  readonly size: number;

  private constructor(secret: string) {
    this.size = secret.length;
  }

  /** Creates an empty registry. */
  static create(): ToggleRegistry {
    return new ToggleRegistry("");
  }
}

/** Every toggle failure, large enough that TypeScript abbreviates its type by default. */
export const toggleFailures = {
  DISABLED: { status: 400, message: "Toggle is disabled" },
  FORBIDDEN: { status: 403, message: "Toggle is forbidden" },
  MISSING: { status: 404, message: "Toggle not found" },
  BROKEN: { status: 500, message: "Toggle is broken" },
} as const;

/**
 * Toggles sharing one value.
 *
 * @typeParam Value - The value each toggle stands for.
 */
export interface ToggleGroup<Value, Key extends string = string> {
  /**
   * Selects by key.
   *
   * @param key - The toggle's key.
   * @returns Whether it was found.
   */
  select(key: Key): boolean;
  /**
   * Selects by value.
   *
   * @param value - The toggle's value.
   * @returns Whether the value was found.
   */
  select(value: Value): boolean;
  /** All values. */
  readonly values: readonly Value[];
}

/** Parses toggle input. */
export interface ToggleParser {
  /**
   * Parses a count.
   *
   * @param value - Decimal digits.
   * @returns An integer.
   * @throws RangeError if out of range.
   */
  parse(value: string): number;
  parse(value: boolean): string;
}

/**
 * Parses a toggle count.
 *
 * @param value - Decimal digits.
 * @returns An integer.
 * @throws RangeError if out of range.
 */
export function parseToggle(value: string): number;
export function parseToggle(value: boolean): string;
export function parseToggle(value: string | boolean): string | number {
  return String(value);
}

export function countToggles(toggles: string): number;
export function countToggles(toggles: readonly string[]): number;
/**
 * Counts toggles.
 *
 * @param toggles - Toggle names.
 * @returns How many there are.
 */
export function countToggles(toggles: string | readonly string[]): number {
  return toggles.length;
}

/** A toggle's state at one point in time. */
export class ToggleSnapshot {
  /** @param state - The captured state. */
  constructor(
    readonly state: string,
    /** @internal */ readonly hidden: string,
    readonly ɵsecret: string,
    readonly _cache: string,
  ) {}
}

/**
 * Parses a toggle count, declared elsewhere.
 *
 * @param value - Decimal digits.
 * @returns An integer.
 * @throws RangeError if out of range.
 */
export declare function parseAmbientToggle(value: string): number;
export declare function parseAmbientToggle(value: boolean): string;

/** Parses toggle input, declared elsewhere. */
export declare class AmbientToggleParser {
  parse(value: boolean): string;
  /**
   * Parses a count.
   *
   * @param value - Decimal digits.
   * @returns An integer.
   * @throws RangeError if out of range.
   */
  parse(value: string): number;
}

/** Parses toggle input in subclasses. */
export abstract class AbstractToggleParser {
  abstract parse(value: boolean): string;
  /**
   * Parses a count.
   *
   * @param value - Decimal digits.
   * @returns An integer.
   * @throws RangeError if out of range.
   */
  abstract parse(value: string): number;
}

/** Parses toggle input. */
export class ImplementedToggleParser {
  parse(value: string): number;
  parse(value: boolean): string;
  /**
   * Parses a count or a flag.
   *
   * @param value - Digits or a flag.
   * @returns The parsed value.
   */
  parse(value: string | boolean): number | string {
    return String(value);
  }
}

/** Inherits documented parsing. */
export class InheritedToggleParser extends ImplementedToggleParser {}

/** Parses toggle input in subclasses, or numbers statically. */
export abstract class MixedToggleParser {
  abstract parse(value: boolean): string;
  /**
   * Parses a count.
   *
   * @param value - Decimal digits.
   * @returns An integer.
   * @throws RangeError if out of range.
   */
  abstract parse(value: string): number;
  static parse(value: number): number {
    return value;
  }
}
