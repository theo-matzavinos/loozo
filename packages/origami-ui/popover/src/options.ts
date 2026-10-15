import { InjectionToken, forwardRef, inject } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/** Logical main-side placement, resolved from the Anchor's writing mode and direction. */
export type OrigamiPopoverSide = "block-start" | "block-end" | "inline-start" | "inline-end";

/** Cross-axis logical alignment. `center` has no start/end edge preference. */
export type OrigamiPopoverAlign = "start" | "center" | "end";

const popoverReplacement = new InjectionToken<OrigamiPopoverOptions>(
  "OrigamiPopoverOptions replacement",
);
const triggerReplacement = new InjectionToken<OrigamiPopoverTriggerOptions>(
  "OrigamiPopoverTriggerOptions replacement",
);
const anchorReplacement = new InjectionToken<OrigamiPopoverAnchorOptions>(
  "OrigamiPopoverAnchorOptions replacement",
);
const contentReplacement = new InjectionToken<OrigamiPopoverContentOptions>(
  "OrigamiPopoverContentOptions replacement",
);

/** Whole, substitutable root configuration; aliases are resolved after construction. */
export abstract class OrigamiPopoverOptions {
  /** Requested open state, writable by behavior; direct model default false. Not native visibility or exit retention. */
  abstract readonly open: WritableSignal<boolean>;
  /** Prevents Trigger activation, default false. External writes and dismissal remain authoritative. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * User branch-dismissal permission, direct default true. The owner's own Trigger may bypass
   * only this owner's flag; any protected requested-open descendant still vetoes the whole
   * branch without partial writes. Script/model close ignores this permission.
   */
  abstract readonly dismissible: Signal<boolean>;

  /**
   * Replaces all root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns Local replacement and public alias providers. A co-matched primitive default cannot override them in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverOptions> | AbstractType<OrigamiPopoverOptions>,
  ): Provider[] {
    return [
      { provide: popoverReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverOptions, useExisting: popoverReplacement },
    ];
  }

  /**
   * Replaces all root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying every required signal. Ordinary writable signals are valid.
   * @returns Local replacement and public alias providers; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiPopoverOptions): Provider[] {
    return [
      { provide: popoverReplacement, useFactory: factory },
      { provide: OrigamiPopoverOptions, useExisting: popoverReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred directive default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverOptions> | AbstractType<OrigamiPopoverOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverOptions,
        useFactory: () => {
          const replacement = inject(popoverReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}

/** Substitutable Trigger identity; also authoritative when Trigger and Anchor share one element. */
export abstract class OrigamiPopoverTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the entire Trigger configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns Local replacement and public alias providers, preserved when the primitive also matches directly in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverTriggerOptions> | AbstractType<OrigamiPopoverTriggerOptions>,
  ): Provider[] {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Replaces the entire Trigger Options configuration, supplying `id`, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`.
   * @returns Local replacement and public alias providers, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiPopoverTriggerOptions): Provider[] {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiPopoverTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred Trigger default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverTriggerOptions> | AbstractType<OrigamiPopoverTriggerOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverTriggerOptions,
        useFactory: () => {
          const replacement = inject(triggerReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}

/** Substitutable standalone Anchor identity. Co-located Trigger Options take precedence for the shared DOM ID. */
export abstract class OrigamiPopoverAnchorOptions {
  /** Effective reactive standalone DOM ID; never used as the private positioning association. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the entire Anchor configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns Local replacement and public alias providers, preserved when the primitive also matches directly in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverAnchorOptions> | AbstractType<OrigamiPopoverAnchorOptions>,
  ): Provider[] {
    return [
      { provide: anchorReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverAnchorOptions, useExisting: anchorReplacement },
    ];
  }

  /**
   * Substitutes the standalone Anchor's effective ID signal.
   * @param factory - Injection-context factory supplying `id`.
   * @returns Local replacement and public alias providers, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiPopoverAnchorOptions): Provider[] {
    return [
      { provide: anchorReplacement, useFactory: factory },
      { provide: OrigamiPopoverAnchorOptions, useExisting: anchorReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred Anchor default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverAnchorOptions> | AbstractType<OrigamiPopoverAnchorOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverAnchorOptions,
        useFactory: () => {
          const replacement = inject(anchorReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}

/**
 * Whole Content configuration. Former ID-only factories must migrate to all four fields;
 * defaults on an unused directive never repair an incomplete replacement.
 * Placement uses the Anchor's axes, not the Content's direction. Consumer sizing remains owned by CSS.
 *
 * @example
 * ```ts
 * OrigamiPopoverContentOptions.provideFactory(() => ({
 *   id: signal("tasks"), side: signal<OrigamiPopoverSide>("block-end"),
 *   align: signal<OrigamiPopoverAlign>("start"), gap: signal(8),
 * }));
 * ```
 */
export abstract class OrigamiPopoverContentOptions {
  /** Effective reactive DOM ID; mounted-only Trigger `aria-controls` follows it. */
  abstract readonly id: Signal<string>;
  /** Logical main side, direct default `block-end`. Reactively resolved from the Anchor's supported writing mode. */
  abstract readonly side: Signal<OrigamiPopoverSide>;
  /** Logical cross alignment, direct default `start`; `center` has no alignment suffix. */
  abstract readonly align: Signal<OrigamiPopoverAlign>;
  /**
   * Main-side separation in CSS pixels, direct default 0. Must be finite and nonnegative;
   * reading invalid effective configuration throws `RangeError` rather than clamping. This is
   * configuration validation, separate from asynchronous positioning failure. Use this rather
   * than host margins.
   */
  abstract readonly gap: Signal<number>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class whose instances
   *   supply all four required signals; forward references are supported.
   * @returns Local replacement and public alias providers, preserved when the primitive also matches directly in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverContentOptions> | AbstractType<OrigamiPopoverContentOptions>,
  ): Provider[] {
    return [
      { provide: contentReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverContentOptions, useExisting: contentReplacement },
    ];
  }

  /**
   * Replaces every Content Option, including the approved placement fields.
   * @param factory - Runs in injection context; supply `id`, `side`, `align`, and finite nonnegative `gap` signals.
   * @returns Local replacement and public alias providers. ID-only factories are not supported.
   */
  static provideFactory(factory: () => OrigamiPopoverContentOptions): Provider[] {
    return [
      { provide: contentReplacement, useFactory: factory },
      { provide: OrigamiPopoverContentOptions, useExisting: contentReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred Content default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverContentOptions> | AbstractType<OrigamiPopoverContentOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverContentOptions,
        useFactory: () => {
          const replacement = inject(contentReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}
