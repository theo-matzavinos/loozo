import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { ɵOrigamiRovingFocusContext } from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueId, injectUniqueValue } from "@loozo/origami-ui/utils";
import { TabsContext } from "./tabs";

const triggerReplacement = new InjectionToken<OrigamiTabsTriggerOptions>(
  "Tabs Trigger replacement",
);

/**
 * Effective Trigger configuration. Other parts read it only once the Trigger has published its
 * registration in `ngOnInit`, after Angular set its inputs, so replacement Options may use
 * required inputs.
 */
export abstract class OrigamiTabsTriggerOptions {
  /** The value this Trigger selects and pairs with the Panel of the same value. */
  abstract readonly value: Signal<string>;
  /** Effective DOM ID, named by the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;
  /** Blocks this Trigger's user selection and focus, combined with the root's disabled policy. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers; a directly matched Trigger default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsTriggerOptions> | AbstractType<OrigamiTabsTriggerOptions>,
  ): Provider[] {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiTabsTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Replaces all Trigger Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, id and disabled.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiTabsTriggerOptions): Provider[] {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiTabsTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiTabsTriggerOptions> | AbstractType<OrigamiTabsTriggerOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiTabsTriggerOptions,
        useFactory: () => {
          const replacement = inject(triggerReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
  }
}

/**
 * A native `type="button"` with `role="tab"`. Click, Enter or
 * Space focuses it and selects its value once if it is still mounted and enabled after its focus
 * handlers ran; selecting the selected tab writes nothing and there is no deselection. Arrow keys along the effective orientation (horizontal arrows follow
 * reading direction), Home and End move focus among enabled Triggers in DOM order, wrapping at
 * the ends; with automatic activation the Trigger a move focuses is selected if it is still
 * mounted, enabled and focused after its focus handlers ran. Other focus never selects. One
 * enabled Trigger is the tab stop (`tabindex="0"`): the focused one, else the first selected,
 * else the first. Root or own disabled state sets native `disabled`, `aria-disabled` and
 * `data-disabled` and removes the Trigger from navigation; a disabled selected Trigger stays
 * `aria-selected`. `aria-controls` names only a mounted Panel of the same value. If a focused
 * Trigger is removed or disabled while focus has not moved elsewhere, focus moves to the new
 * tab stop without selecting. Requires a nearest Tabs root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogTabsTrigger]",
  providers: [OrigamiTabsTriggerOptions.ɵprovideDefault(() => OrigamiTabsTrigger)],
  host: {
    role: "tab",
    type: "button",
    "[id]": "effectiveId()",
    "[disabled]": "effectiveDisabled()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-selected]": "selected()",
    "[attr.aria-controls]": "panelId()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-selected]": "selectedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiTabsTrigger implements OrigamiTabsTriggerOptions {
  /**
   * Own value input, default a generated value that pairs with nothing; give each
   * Trigger and its Panel the same explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueValue("tabs-trigger-value"));
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("tabs-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiTabsTriggerOptions);
  readonly #context = inject(TabsContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Combined root and own disabled policy. */
  protected readonly effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal Selection ARIA observation, always `true` or `false`. */
  protected readonly selected = computed(() => this.#context.value() === this.#options().value());
  /** @internal Mounted-only control association. */
  protected readonly panelId = computed(() => this.#context.panelId(this.#options().value()));

  readonly #registration = this.#context.trigger(this.#options);
  readonly #focus = inject(ɵOrigamiRovingFocusContext).item({
    value: computed(() => this.#options().value()),
    disabled: this.effectiveDisabled,
  });

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop()) {
      return "0";
    }

    return "-1";
  });

  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = computed(() => {
    if (this.effectiveDisabled()) {
      return "true";
    }

    return null;
  });

  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.selected()) {
      return "";
    }

    return null;
  });

  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.effectiveDisabled()) {
      return "";
    }

    return null;
  });

  /** Captures this Trigger's unpublished registrations; an orphan fails Angular DI clearly. */
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Publishes this Trigger's registrations once Angular has set its inputs. */
  ngOnInit(): void {
    this.#registration.publish();
    this.#focus.publish();
  }

  /**
   * @internal Live native activation request, obeying effective disabled Options. Not every
   * engine focuses a clicked button, so activation focuses this Trigger to make it the roving
   * position; that focus never selects. Its focus handlers may remove or disable this Trigger,
   * so the guard runs again once focus returns.
   */
  protected activate(): void {
    if (!this.#selectable()) {
      return;
    }

    this.#element.focus();

    if (!this.#selectable()) {
      return;
    }

    this.#context.select(this.#options().value());
  }

  /** @internal Arrow/Home/End navigation along the effective orientation. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(event);
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus();
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur();
  }

  /** Live activation guard: mounted and not disabled by the root or its own Options. */
  #selectable(): boolean {
    return !this.#destroyed && !this.effectiveDisabled();
  }
}
