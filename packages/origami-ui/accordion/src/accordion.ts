import {
  DestroyRef,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
  OrigamiCollapsiblePanel,
  OrigamiCollapsiblePanelOptions,
} from "@loozo/origami-ui/collapsible";
import type { OrigamiCollapsibleHiding } from "@loozo/origami-ui/collapsible";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

// Private, per-role replacement tokens keep public Options structurally implementable.
const sharedReplacement = new InjectionToken<OrigamiAccordionOptions>(
  "Accordion shared replacement",
);
const singleReplacement = new InjectionToken<OrigamiAccordionSingleOptions>(
  "Accordion Single replacement",
);
const multipleReplacement = new InjectionToken<OrigamiAccordionMultipleOptions>(
  "Accordion Multiple replacement",
);
const triggerReplacement = new InjectionToken<OrigamiAccordionTriggerOptions>(
  "Accordion Trigger replacement",
);
const panelReplacement = new InjectionToken<OrigamiAccordionPanelOptions>(
  "Accordion Panel replacement",
);

/**
 * Shared effective root configuration; deliberately contains no mode-specific selection fields.
 * Provider helpers return local replacement-plus-alias arrays, safe to nest in `providers`.
 * Primitive defaults never override those replacements when direct/host selectors co-match.
 */
export abstract class OrigamiAccordionOptions {
  /** Blocks item user requests in combination with item disabled input; default false. External selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces shared root configuration with an existing provider.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array; mode selection still comes from its own token.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionOptions> | AbstractType<OrigamiAccordionOptions>,
  ): Provider {
    return [
      { provide: sharedReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionOptions, useExisting: sharedReplacement },
    ];
  }

  /**
   * Replaces the entire shared configuration.
   * @param factory - Injection-context factory supplying the required disabled signal.
   * @returns A local replacement-and-alias provider array, without fallback to unused directive inputs.
   */
  static provideFactory(factory: () => OrigamiAccordionOptions): Provider {
    return [
      { provide: sharedReplacement, useFactory: factory },
      { provide: OrigamiAccordionOptions, useExisting: sharedReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only default that cannot displace a helper-provided local replacement.
   * @param type - Default provider supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiAccordionOptions> | AbstractType<OrigamiAccordionOptions>,
  ): Provider {
    return {
      provide: OrigamiAccordionOptions,
      useFactory: () => {
        const replacement = inject(sharedReplacement, {
          self: true,
          optional: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject<OrigamiAccordionOptions>(forwardRef(type));
      },
    };
  }
}

/**
 * Effective Single configuration. Unknown values remain authoritative and are never auto-normalized.
 * Helper provider arrays replace configuration locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionSingleOptions {
  /** Writable nullable selected value, default null. Ordinary writable signals are valid replacements. */
  abstract readonly value: WritableSignal<string | null>;
  /** Root user-request disabled policy, default false; external selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;
  /** Whether a selected enabled item can request clearing to null; default false. */
  abstract readonly collapsible: Signal<boolean>;

  /**
   * Replaces all Single configuration with a compatible existing provider.
   * @param type - Concrete or abstract class supplier; forward references are supported.
   * @returns A local replacement-and-alias provider array resolved after construction, including consumer host directives.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionSingleOptions> | AbstractType<OrigamiAccordionSingleOptions>,
  ): Provider {
    return [
      { provide: singleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * Replaces all Single configuration with factory-owned signals.
   * @param factory - Runs in injection context and must supply value, disabled and collapsible.
   * @returns A local replacement-and-alias provider array; writing replacement signals does not fabricate unused model outputs.
   */
  static provideFactory(factory: () => OrigamiAccordionSingleOptions): Provider {
    return [
      { provide: singleReplacement, useFactory: factory },
      { provide: OrigamiAccordionSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Single default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionSingleOptions>): Provider {
    return {
      provide: OrigamiAccordionSingleOptions,
      useFactory: () => {
        const replacement = inject(singleReplacement, {
          self: true,
          optional: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject<OrigamiAccordionSingleOptions>(forwardRef(type));
      },
    };
  }
}

/**
 * Effective Multiple configuration; it does not contain Single's collapsible property.
 * Helper provider arrays replace configuration locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionMultipleOptions {
  /** Writable readonly-array selection, default empty. Unknown values/order persist; user toggles allocate new arrays. */
  abstract readonly value: WritableSignal<readonly string[]>;
  /** Root user-request disabled policy, default false; external selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces all Multiple configuration with an existing provider.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array resolved after construction.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiAccordionMultipleOptions>
      | AbstractType<OrigamiAccordionMultipleOptions>,
  ): Provider {
    return [
      { provide: multipleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * Replaces all Multiple configuration without merging unused defaults.
   * @param factory - Injection-context factory supplying value and disabled signals.
   * @returns A local replacement-and-alias provider array. Ordinary writable signals do not emit an unused root model output.
   */
  static provideFactory(factory: () => OrigamiAccordionMultipleOptions): Provider {
    return [
      { provide: multipleReplacement, useFactory: factory },
      { provide: OrigamiAccordionMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Multiple default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionMultipleOptions>): Provider {
    return {
      provide: OrigamiAccordionMultipleOptions,
      useFactory: () => {
        const replacement = inject(multipleReplacement, {
          self: true,
          optional: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject<OrigamiAccordionMultipleOptions>(forwardRef(type));
      },
    };
  }
}

/**
 * Effective upper Trigger identity, forwarded to the composed Collapsible Options token.
 * Helper provider arrays replace identity locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionTriggerOptions {
  /** Authoritative reactive DOM ID for this Trigger and its mounted Panel's labelling association. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Trigger configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array for direct or host-composed Triggers.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionTriggerOptions> | AbstractType<OrigamiAccordionTriggerOptions>,
  ): Provider {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Replaces upper Trigger identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local replacement-and-alias provider array; lower behavior reads this upper token, not the upper directive.
   */
  static provideFactory(factory: () => OrigamiAccordionTriggerOptions): Provider {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiAccordionTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Trigger default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionTriggerOptions>): Provider {
    return {
      provide: OrigamiAccordionTriggerOptions,
      useFactory: () => {
        const replacement = inject(triggerReplacement, {
          self: true,
          optional: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject<OrigamiAccordionTriggerOptions>(forwardRef(type));
      },
    };
  }
}

/**
 * Effective upper Panel identity, forwarded to the composed Collapsible Options token.
 * Helper provider arrays replace identity locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionPanelOptions {
  /** Authoritative reactive DOM ID, named by the mounted Trigger's aria-controls. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Panel configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array, resolved after construction.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionPanelOptions> | AbstractType<OrigamiAccordionPanelOptions>,
  ): Provider {
    return [
      { provide: panelReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * Replaces upper Panel identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local replacement-and-alias provider array; lower bindings use this token instead of unused directive defaults.
   */
  static provideFactory(factory: () => OrigamiAccordionPanelOptions): Provider {
    return [
      { provide: panelReplacement, useFactory: factory },
      { provide: OrigamiAccordionPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Panel default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionPanelOptions>): Provider {
    return {
      provide: OrigamiAccordionPanelOptions,
      useFactory: () => {
        const replacement = inject(panelReplacement, {
          self: true,
          optional: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject<OrigamiAccordionPanelOptions>(forwardRef(type));
      },
    };
  }
}

/** Private upper Item configuration, aliased after construction; not an application authoring API. */
const accordionItemConfiguration = new InjectionToken<{
  readonly value: Signal<string>;
  readonly disabled: Signal<boolean>;
  readonly hiding: Signal<OrigamiCollapsibleHiding>;
}>("Accordion Item configuration");

abstract class Selection {
  abstract selected(value: string): boolean;
  abstract locked(value: string): boolean;
  abstract request(value: string, expanded: boolean): void;
}

@Service({ autoProvided: false })
class SingleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiAccordionSingleOptions);

  selected(value: string): boolean {
    return this.#options().value() === value;
  }

  locked(value: string): boolean {
    return this.selected(value) && !this.#options().collapsible();
  }

  request(value: string, expanded: boolean): void {
    const options = this.#options();
    const selected = options.value() === value;

    if (expanded === selected) {
      return;
    }

    if (expanded) {
      options.value.set(value);

      return;
    }

    if (options.collapsible()) {
      options.value.set(null);
    }
  }
}

@Service({ autoProvided: false })
class MultipleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiAccordionMultipleOptions);

  selected(value: string): boolean {
    return this.#options().value().includes(value);
  }

  locked(): boolean {
    return false;
  }

  request(value: string, expanded: boolean): void {
    const options = this.#options();
    const current = options.value();
    const selected = current.includes(value);

    if (expanded === selected) {
      return;
    }

    if (expanded) {
      options.value.set([...current, value]);

      return;
    }

    const remaining: string[] = [];

    for (const entry of current) {
      if (entry !== value) {
        remaining.push(entry);
      }
    }

    options.value.set(remaining);
  }
}

@Service({ autoProvided: false })
class AccordionContext {
  readonly #options = injectDeferred(OrigamiAccordionOptions);
  readonly #selection = injectDeferred(Selection);
  #destroyed = false;

  readonly disabled = computed(() => this.#options().disabled());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  selected(value: string): boolean {
    return this.#selection().selected(value);
  }

  locked(value: string): boolean {
    return this.#selection().locked(value);
  }

  request(value: string, expanded: boolean): void {
    if (!this.#destroyed && !this.disabled()) {
      this.#selection().request(value, expanded);
    }
  }
}

@Service({ autoProvided: false })
class AccordionItemContext {
  readonly #root = inject(AccordionContext);
  readonly #item = injectDeferred(OrigamiCollectionItemOptions);
  readonly #collapsible = injectDeferred(OrigamiCollapsibleOptions);
  #destroyed = false;

  readonly disabled = computed(() => this.#collapsible().disabled());
  readonly locked = computed(() => this.#root.locked(this.#item().value()));
  readonly expanded = linkedSignal(() => this.#root.selected(this.#item().value()), {
    set: (expanded) => {
      if (!this.#destroyed && !this.disabled()) {
        this.#root.request(this.#item().value(), expanded);
      }
    },
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }
}

/** Locally provided readonly observation of the nearest Single or Multiple root. */
@Service({ autoProvided: false })
export class OrigamiAccordionState {
  readonly #collection = inject(OrigamiCollectionState);
  readonly #context = inject(AccordionContext);

  /** Mounted effective item values in Collection DOM order; value edits/removal never normalize selection. */
  readonly itemValues: Signal<readonly string[]> = computed(() => {
    const values: string[] = [];

    for (const item of this.#collection.items()) {
      values.push(item.value());
    }

    return values;
  });
  /** Effective shared root disabled policy, without a writable alias. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * @internal Compiler/composition support export retained for package compatibility.
 * Composes Collection and provides the local Accordion Context/State. Not a supported
 * application authoring API; consumers use the concrete Single or Multiple root.
 */
@Directive({
  hostDirectives: [OrigamiCollection],
  providers: [AccordionContext, OrigamiAccordionState],
})
export class ɵOrigamiAccordionRoot {}

/**
 * Single-selection root with null default and optional clearing. Unknown external values
 * persist; no first-item selection or pruning is performed. Native buttons supply activation;
 * consumers own headings, panel roles, styling and any additional navigation semantics.
 *
 * @example
 * ```html
 * <section ogAccordionSingle [(value)]="selected" [collapsible]="true">
 *   <article ogAccordionItem value="billing">
 *     <h2><button ogAccordionTrigger>Billing</button></h2>
 *     <div ogAccordionPanel role="region">Details</div>
 *   </article>
 * </section>
 * ```
 */
@Directive({
  selector: "[ogAccordionSingle]",
  exportAs: "ogAccordionSingle",
  hostDirectives: [ɵOrigamiAccordionRoot],
  providers: [
    SingleSelection,
    { provide: Selection, useExisting: SingleSelection },
    OrigamiAccordionSingleOptions.ɵprovideDefault(() => OrigamiAccordionSingle),
    OrigamiAccordionOptions.ɵprovideDefault(() => OrigamiAccordionSingleOptions),
  ],
})
export class OrigamiAccordionSingle implements OrigamiAccordionSingleOptions {
  /** Own selection model, default null; valueChange emits accepted model writes. Substituted factory signals do not fabricate this output. */
  readonly value = model<string | null>(null);
  /** Own root disabled input, default false with boolean-attribute coercion. Effective substituted Options govern behavior instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own clearing policy, default false with boolean-attribute coercion; a selected non-collapsible Trigger remains natively focusable. */
  readonly collapsible = input(false, { transform: booleanAttribute });
  /** Shared readonly nearest-root item order and effective disabled observation. */
  readonly state = inject(OrigamiAccordionState);
}

/**
 * Multiple-selection root. User toggles create new arrays, preserve other values/order and
 * never mutate the caller's array. Unmounted selections persist. No roles, headings, arrow
 * navigation or roving tabindex are supplied; consumers own those domain semantics.
 */
@Directive({
  selector: "[ogAccordionMultiple]",
  exportAs: "ogAccordionMultiple",
  hostDirectives: [ɵOrigamiAccordionRoot],
  providers: [
    MultipleSelection,
    { provide: Selection, useExisting: MultipleSelection },
    OrigamiAccordionMultipleOptions.ɵprovideDefault(() => OrigamiAccordionMultiple),
    OrigamiAccordionOptions.ɵprovideDefault(() => OrigamiAccordionMultipleOptions),
  ],
})
export class OrigamiAccordionMultiple implements OrigamiAccordionMultipleOptions {
  /** Own readonly-array model, default empty; valueChange emits accepted writes once. Substituted writable signals supply effective selection instead. */
  readonly value = model<readonly string[]>([]);
  /** Own root disabled input, default false with boolean-attribute coercion. Does not block authoritative external selection writes. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Shared readonly nearest-root item order and effective disabled observation. */
  readonly state = inject(OrigamiAccordionState);
}

/**
 * Composes Collection Item and Collapsible under the nearest Accordion root; orphans fail DI.
 * Expansion observes actual effective selection. Lower expansion writes route through the
 * concrete mode without optimistic local writes, so synchronous selection/output reentry
 * is reflected on the next read. Lower Options adapters resolve private typed Item
 * configuration after construction rather than injecting this directive. Replacing public
 * Collection Item Options remains authoritative for the observed/selected item value.
 * Caller-scoped lower registration handles unmount/remount.
 */
@Directive({
  selector: "[ogAccordionItem]",
  exportAs: "ogAccordionItem",
  hostDirectives: [OrigamiCollectionItem, OrigamiCollapsible],
  providers: [
    AccordionItemContext,
    { provide: accordionItemConfiguration, useExisting: forwardRef(() => OrigamiAccordionItem) },
    OrigamiCollectionItemOptions.provideFactory(() => inject(accordionItemConfiguration)),
    OrigamiCollapsibleOptions.provideFactory(() => {
      const item = inject(accordionItemConfiguration);
      const root = inject(AccordionContext);

      return {
        expanded: inject(AccordionItemContext).expanded,
        disabled: computed(() => root.disabled() || item.disabled()),
        hiding: item.hiding,
      };
    }),
  ],
})
export class OrigamiAccordionItem implements OrigamiCollectionItemOptions {
  /** Own value input, default opaque hydration-stable generated identity. Explicit distinct domain values provide persistent independent selection. */
  readonly value = input(injectUniqueId("accordion-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined reactively with root disabled for click/native reveal requests. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own collapsed hiding input, default hidden; inherits Presence exit retention and progressive until-found behavior. */
  readonly hiding = input<OrigamiCollapsibleHiding>("hidden");

  /** Validates the nearest Accordion owner synchronously, without resolving aliased Options during construction. */
  constructor() {
    inject(AccordionItemContext);
  }
}

/**
 * Native type=button Trigger composed through Collapsible. Effective upper ID Options
 * drive the lower bindings and mounted-only association. Selected non-collapsible Single
 * items are aria-disabled but stay natively enabled/focusable unless root/item disabled.
 * Requires a nearest Accordion Item. No custom Enter/Space or arrow-key handler is added.
 */
@Directive({
  selector: "button[ogAccordionTrigger]",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.ɵprovideDefault(() => OrigamiAccordionTrigger),
    OrigamiCollapsibleTriggerOptions.provideFactory(() => inject(OrigamiAccordionTriggerOptions)),
  ],
  host: { "[attr.aria-disabled]": "disabledAria()" },
})
export class OrigamiAccordionTrigger implements OrigamiAccordionTriggerOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs remain authoritative unless upper Options are replaced. */
  readonly id = input(injectUniqueId("accordion-trigger"));

  readonly #item = inject(AccordionItemContext);

  /** @internal Combined native-disabled/non-collapsible ARIA policy; lower native disabled binding is unchanged. */
  protected readonly disabledAria = computed(() => {
    if (this.#item.disabled() || this.#item.locked()) {
      return "true";
    }

    return null;
  });
}

/**
 * Panel composed through Collapsible/Presence. Upper Options drive lower identity and
 * mounted-only labelling; desired expansion markers and finite exit hiding are inherited.
 * Consumers own headings, optional region role, content semantics and animation styles.
 * Requires a nearest Accordion Item.
 */
@Directive({
  selector: "[ogAccordionPanel]",
  hostDirectives: [OrigamiCollapsiblePanel],
  providers: [
    OrigamiAccordionPanelOptions.ɵprovideDefault(() => OrigamiAccordionPanel),
    OrigamiCollapsiblePanelOptions.provideFactory(() => inject(OrigamiAccordionPanelOptions)),
  ],
})
export class OrigamiAccordionPanel implements OrigamiAccordionPanelOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs or substituted upper Options reactively update mounted-only controls links. */
  readonly id = input(injectUniqueId("accordion-panel"));

  /** Validates the nearest Accordion Item synchronously; a bare Collapsible owner is not an Accordion Item. */
  constructor() {
    inject(AccordionItemContext);
  }
}
